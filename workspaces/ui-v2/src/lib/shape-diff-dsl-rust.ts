import equals from 'lodash.isequal';

import {
  IJsonObjectKey,
  IJsonTrail,
  normalize,
} from '@useoptic/cli-shared/build/diffs/json-trail';
import sortBy from 'lodash.sortby';
import {
  IValueAffordanceSerialization,
  IValueAffordanceSerializationWithCounter,
} from '@useoptic/cli-shared/build/diffs/initial-types';
import { JsonHelper, opticEngine } from '@useoptic/domain';
import { ParsedDiff } from '../parse-diff';
import invariant from 'invariant';
import { ICoreShapeKinds } from '../interfaces/interfaces';
import { FieldContextSpecChange } from './spec-change-dsl';
import { namer, namerForOneOf } from './quick-namer';
import {
  INullableTrail,
  IOneOfItemTrail,
  IOneOfTrail,
  IOptionalItemTrail,
  IShapeTrail,
  IUnknownTrail,
} from '@useoptic/cli-shared/build/diffs/shape-trail';
import { DiffRfcBaseState } from '@useoptic/cli-shared/build/diffs/diff-rfc-base-state';

/*
Goal: Make the shape diff interpretation logic (the hard stuff) drop dead simple to read
 */
const ExpectedScalaHelper = opticEngine.com.useoptic.diff.interactions.interpreters.ExpectedHelper();

interface IExpectationHelper {
  allowedCoreShapes: string[];
  lastField?: string;
  lastFieldKey?: string;
  allowedCoreShapeKindsByShapeId: { [key: string]: ICoreShapeKinds };
  lastFieldShapeId?: string;
  fieldIsOptional?: boolean;
  lastObject?: string;
  lastList?: string;
  lastListItem?: string;
  lastOneOf?: IOneOfTrail;
  lastOneOfItem?: IOneOfItemTrail;
  lastUnknownTrail?: IUnknownTrail;
  lastNullable?: INullableTrail;
  lastOptionalItemTrail?: IOptionalItemTrail;
  rootShapeId?: string;
  shapeName?: string;
}

export function expectationsFromSpecOption(
  diff: ParsedDiff,
  rfcBaseState: DiffRfcBaseState,
  shapeTrail: IShapeTrail,
  jsonTrail: IJsonTrail
) {
  try {
    return new Expectation(diff, rfcBaseState, shapeTrail, jsonTrail);
  } catch (e) {
    console.error('scala domain confused by diff', e);
    return undefined;
  }
}

export class Expectation {
  private expectationsFromSpec: IExpectationHelper;
  constructor(
    private diff: ParsedDiff,
    public rfcBaseState: DiffRfcBaseState,
    private shapeTrail: IShapeTrail,
    private jsonTrail: IJsonTrail
  ) {
    const expected = ExpectedScalaHelper.expectedForDiffStrings(
      JSON.stringify(shapeTrail),
      rfcBaseState.rfcState
    );
    this.expectationsFromSpec = JsonHelper.toJs(expected);
  }

  isListItemShape(): boolean {
    return Boolean(this.expectationsFromSpec.lastListItem);
  }

  lastListItem(): string {
    return this.expectationsFromSpec.lastListItem!;
  }

  rootShapeId(): string {
    return this.expectationsFromSpec.rootShapeId!;
  }

  lastList(): string {
    return this.expectationsFromSpec.lastList!;
  }

  isField(): boolean {
    return !!this.expectationsFromSpec.lastField;
  }

  aRequiredField(): boolean {
    return this.isField() && !this.isOptionalField();
  }

  lastObject(): string {
    invariant(
      this.expectationsFromSpec.lastObject,
      'parent object shapeId not found'
    );
    return this.expectationsFromSpec.lastObject;
  }

  isOptionalField(): boolean {
    invariant(this.isField(), 'shape trail is not a field.');
    return this.expectationsFromSpec.fieldIsOptional;
  }

  fieldKey(): string {
    invariant(this.isField(), 'shape trail is not a field.');
    return this.expectationsFromSpec.lastFieldKey!;
  }

  fieldShapeId(): string {
    invariant(this.isField(), 'shape trail is not a field.');
    return this.expectationsFromSpec.lastFieldShapeId!;
  }

  fieldId(): string | undefined {
    return this.expectationsFromSpec.lastField;
  }

  shapeName(): string {
    this.expectedShapes();
    return namer(Array.from(this.expectedShapes()));
  }

  expectedShapes(): Set<ICoreShapeKinds> {
    return new Set(
      this.expectationsFromSpec.allowedCoreShapes.map(
        (i) => i as ICoreShapeKinds
      )
    );
  }

  allowedCoreShapeKindsByShapeId(): { [key: string]: ICoreShapeKinds } {
    return this.expectationsFromSpec.allowedCoreShapeKindsByShapeId;
  }

  // this tells us which (if any) shapes were observed at trail that weren't expected
  // ie expects [string, number]. If this returns [], nothing more than [string, number] observed
  // if this return [list, nullable], that means it's also been a list and null.
  diffActual: (Actual) => ICoreShapeKinds[] = (actual: Actual) => {
    const a = this.expectedShapes();
    const b = actual.observedCoreShapeKinds();
    return Array.from(b).filter((x) => !a.has(x));
  };

  unionWithActual: (Actual) => ICoreShapeKinds[] = (actual: Actual) => {
    const a = this.expectedShapes();
    const b = actual.observedCoreShapeKinds();
    return Array.from(new Set([...Array.from(a), ...Array.from(b)]));
  };

  // build the command helpers
  fieldChangeHelper(actual: Actual) {
    return new FieldContextSpecChange(this, actual, this.rfcBaseState);
  }
}

export class Actual {
  private trailAffordances: IValueAffordanceSerialization[];
  constructor(
    public learnedTrails: IValueAffordanceSerializationWithCounter,
    private shapeTrail: IShapeTrail,
    public jsonTrail: IJsonTrail
  ) {
    this.trailAffordances = learnedTrails.affordances.filter((i) => {
      const compared = equals(normalize(i.trail), normalize(jsonTrail));
      return compared;
    });
  }

  isField(): boolean {
    return Boolean(this.fieldKey());
  }
  fieldKey(): string | undefined {
    const jsonTrailLast = this.jsonTrail.path[this.jsonTrail.path.length - 1];
    const last = (jsonTrailLast as IJsonObjectKey).JsonObjectKey;
    if (last) {
      return last.key;
    }
  }

  observedCoreShapeKinds(): Set<ICoreShapeKinds> {
    const kinds: Set<ICoreShapeKinds> = new Set([]);

    if (this.wasString()) kinds.add(ICoreShapeKinds.StringKind);
    if (this.wasNumber()) kinds.add(ICoreShapeKinds.NumberKind);
    if (this.wasBoolean()) kinds.add(ICoreShapeKinds.BooleanKind);
    if (this.wasNull()) kinds.add(ICoreShapeKinds.NullableKind);
    if (this.wasArray()) kinds.add(ICoreShapeKinds.ListKind);
    if (this.wasObject()) kinds.add(ICoreShapeKinds.ObjectKind);

    return kinds;
  }

  interactionsGroupedByCoreShapeKind(): IInteractionsGroupedByCoreShapeKind {
    const results: IInteractionsGroupedByCoreShapeKind = [];

    const {
      wasMissing,
      wasNumber,
      wasBoolean,
      wasNull,
      wasArray,
      wasObject,
      wasString,
      wasMissingTrails,
      wasNumberTrails,
      wasBooleanTrails,
      wasNullTrails,
      wasArrayTrails,
      wasObjectTrails,
      wasStringTrails,
    } = this.learnedTrails.interactions;

    if (wasMissing.length)
      results.push({
        label: 'missing',
        kind: ICoreShapeKinds.OptionalKind,
        interactions: wasMissing,
        jsonTrailsByInteractions: wasMissingTrails,
      });
    if (wasString.length)
      results.push({
        label: 'string',
        kind: ICoreShapeKinds.StringKind,
        interactions: wasString,
        jsonTrailsByInteractions: wasStringTrails,
      });
    if (wasNumber.length)
      results.push({
        label: 'number',
        kind: ICoreShapeKinds.NumberKind,
        interactions: wasNumber,
        jsonTrailsByInteractions: wasNumberTrails,
      });
    if (wasBoolean.length)
      results.push({
        label: 'boolean',
        kind: ICoreShapeKinds.BooleanKind,
        interactions: wasBoolean,
        jsonTrailsByInteractions: wasBooleanTrails,
      });
    if (wasNull.length)
      results.push({
        label: 'null',
        kind: ICoreShapeKinds.NullableKind,
        interactions: wasNull,
        jsonTrailsByInteractions: wasNullTrails,
      });
    if (wasArray.length)
      results.push({
        label: 'array',
        kind: ICoreShapeKinds.ListKind,
        interactions: wasArray,
        jsonTrailsByInteractions: wasArrayTrails,
      });
    if (wasObject.length)
      results.push({
        label: 'object',
        kind: ICoreShapeKinds.ObjectKind,
        interactions: wasObject,
        jsonTrailsByInteractions: wasObjectTrails,
      });

    //sort it by the most common variants
    return sortBy(results, (i) => i.interactions.length).reverse();
  }

  //special case, won't ever show up in the affordances
  wasMissing: () => boolean = () =>
    this.learnedTrails.interactions.wasMissing.length > 0;

  //answers was this ever a ____
  wasString: () => boolean = () =>
    this.trailAffordances.some((i) => i.wasString);
  wasNumber: () => boolean = () =>
    this.trailAffordances.some((i) => i.wasNumber);
  wasBoolean: () => boolean = () =>
    this.trailAffordances.some((i) => i.wasBoolean);
  wasNull: () => boolean = () => this.trailAffordances.some((i) => i.wasNull);
  wasArray: () => boolean = () => this.trailAffordances.some((i) => i.wasArray);
  wasObject: () => boolean = () =>
    this.trailAffordances.some((i) => i.wasObject);
}

type IInteractionsGroupedByCoreShapeKind = {
  label: string;
  kind: ICoreShapeKinds;
  interactions: string[];
  jsonTrailsByInteractions: { [key: string]: IJsonTrail[] };
}[];
