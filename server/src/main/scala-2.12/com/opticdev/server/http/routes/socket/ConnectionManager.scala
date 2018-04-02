package com.opticdev.server.http.routes.socket

import akka.actor.ActorSystem
import akka.http.scaladsl.model.ws.{Message, TextMessage}
import akka.stream.scaladsl.Flow
import com.opticdev.server.state.ProjectsManager

import scala.concurrent.ExecutionContext
import scala.util.Failure

trait ConnectionManager[A <: Connection] {

  def apply(slug: String)(implicit actorSystem: ActorSystem, projectsManager: ProjectsManager) : A

  protected var connections: Map[String, A] = Map()

  def listConnections = connections

  def hasConnection = connections.nonEmpty

  def findOrCreate(slug: String)(implicit actorSystem: ActorSystem, projectsManager: ProjectsManager): A = {
    connections.getOrElse(slug, createEditorConnection(slug))
  }

  private def createEditorConnection(slug: String)(implicit actorSystem: ActorSystem, projectsManager: ProjectsManager): A = {
    val connection = apply(slug)
    connections += slug -> connection
    connection
  }

  def websocketChatFlow(connection: A)(implicit executionContext: ExecutionContext, projectsManager: ProjectsManager): Flow[Message, Message, Any] =
    Flow[Message]
      .collect {
        case TextMessage.Strict(msg) => {
          println("RECEIVED "+ msg)
          msg
        }
      }
      .via(connection.websocketFlow)
      .map {
        case msg: OpticEvent => {
          println("SENT "+ msg)
          TextMessage.Strict(msg.asString)
        }
      }.via(reportErrorsFlow())

  def reportErrorsFlow[T]()(implicit executionContext: ExecutionContext): Flow[T, T, Any] =
    Flow[T]
      .watchTermination()((_, f) => f.onComplete {
        case Failure(cause) =>
          println(s"WS stream failed with $cause")
        case _ => //
      })

}
