import { IChanges } from '../changelog/IChanges';

export interface IFieldRenderer {
  fieldId: string;
  name: string;
  parentId: string;
  shapeChoices: IShapeRenderer[];
  required: boolean;
  description?: string;
  changes?: IChanges;
}

export interface IShapeRenderer {
  shapeId: string;
  jsonType: JsonLike;
  asArray?: IArrayRender;
  asObject?: IObjectRender;
  value: any;
  changes?: IChanges;
}

export interface IArrayRender {
  shapeChoices: IShapeRenderer[];
}

export interface IObjectRender {
  fields: IFieldRenderer[];
}

export enum JsonLike {
  OBJECT = 'Object',
  ARRAY = 'Array',
  NULL = 'Null',
  STRING = 'String',
  NUMBER = 'Number',
  BOOLEAN = 'Boolean',
  UNDEFINED = 'Undefined',
}
