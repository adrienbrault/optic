package com.useoptic

import com.useoptic.contexts.requests.Commands.PathComponentId
import com.useoptic.contexts.rfc.Events.RfcEvent
import com.useoptic.contexts.rfc.projections.OASProjection
import com.useoptic.contexts.rfc.{InMemoryQueries, RfcService, RfcServiceJSFacade}
import com.useoptic.contexts.shapes.Commands.{FieldId, ShapeId}
import com.useoptic.contexts.shapes.projections.TrailTags
import com.useoptic.ddd.{AggregateId, EventStore}
import com.useoptic.diff.ChangeType.ChangeType
import com.useoptic.diff.interactions.ShapeRelatedDiff
import com.useoptic.diff.shapes.{JsonTrail, ShapeTrail}
import io.circe.generic.auto._
import io.circe.scalajs.{convertJsToJson, convertJsonToJs}
import io.circe.syntax._
import io.circe.{Encoder, Json}

import scala.scalajs.js
import scala.scalajs.js.Dictionary
import scala.scalajs.js.annotation.{JSExport, JSExportAll, JSExportTopLevel}

@JSExport
@JSExportAll
object OASProjectionHelper {
  def fromEventString(eventString: String): js.Any = {
    val eventStore = RfcServiceJSFacade.makeEventStore()
    eventStore.bulkAdd("id", eventString)
    val rfcService: RfcService = new RfcService(eventStore)
    val queries = new InMemoryQueries(eventStore, rfcService, "id")
    convertJsonToJs(new OASProjection(queries, rfcService, "id").generate)
  }
}

@JSExport
@JSExportAll
case class ContributionWrapper(all: Map[String, Map[String, String]]) {

  import scala.scalajs.js

  def getOrUndefined(id: String, key: String): js.UndefOr[String] = {
    import js.JSConverters._
    all.get(id).flatMap(_.get(key)).orUndefined
  }

  def get(id: String, key: String): Option[String] = all.get(id).flatMap(_.get(key))

  def asJsDictionary: Dictionary[Dictionary[String]] = {
    import js.JSConverters._
    all.mapValues(_.toJSDictionary).toJSDictionary
  }
}

@JSExportTopLevel("Queries")
@JSExportAll
class QueriesFacade(eventStore: EventStore[RfcEvent], service: RfcService, aggregateId: AggregateId) {
  private val q = new InMemoryQueries(eventStore, service, aggregateId)

  implicit val changeTypeEncoder: Encoder[ChangeType] = (a: ChangeType) => Json.fromString(a.toString)

  def pathsWithRequests(): js.Any = {
    convertJsonToJs(q.pathsWithRequests.asJson)
  }

  def requestsState(): js.Any = {
    convertJsonToJs(q.requestsState.asJson)
  }

  def shapesState(): js.Any = {
    convertJsonToJs(q.shapesState.asJson)
  }

  def namedShapes(): js.Any = {
    convertJsonToJs(q.namedShapes.asJson)
  }

  def contributions(): ContributionWrapper = {
    ContributionWrapper(q.contributions)
  }

  def apiName(): String = {
    q.apiName()
  }

  def shapeById(shapeId: ShapeId): js.Any = {
    convertJsonToJs(q.shapesState.flattenedShape(shapeId).asJson)
  }

  def complexityScore(): String = {
    q.complexityScore
  }

  def absolutePath(pathComponentId: PathComponentId): String = {
    q.absolutePath(pathComponentId)
  }

  def resolvePath(url: String): js.Any = {
    convertJsonToJs(q.resolvePath(url).asJson)
  }

  def nameForShapeId(shapeId: ShapeId): js.Any = {
    convertJsonToJs(q.nameForShapeId(shapeId).asJson)
  }

  def nameForFieldId(fieldId: FieldId): js.Any = {
    convertJsonToJs(q.nameForFieldId(fieldId).asJson)
  }

  def flatShapeForShapeId(shapeId: ShapeId, diffs: Seq[ShapeRelatedDiff], trailTags: TrailTags[ShapeTrail] = TrailTags.empty) = {
    q.flatShapeForShapeId(shapeId, diffs, trailTags)
  }

  def flatShapeForExample(example: js.Any, hash: String, trailTags: TrailTags[JsonTrail] = TrailTags.empty) = {
    q.flatShapeForExample(convertJsToJson(example).right.get, hash, trailTags)
  }

  def setupState(): js.Any = {
    convertJsonToJs(q.setupState().asJson)
  }
}
