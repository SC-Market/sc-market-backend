/**
 * Comments Controller
 * Handles comment operations (reply, update, delete, vote)
 */

import {
  Controller,
  Post,
  Route,
  Body,
  Path,
  Security,
  Middlewares,
  Response,
  Request,
  SuccessResponse,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController, ValidationErrorClass, ForbiddenError } from "./base.controller.js"
import {
  Comment,
  CommentReplyPayload,
  CommentUpdatePayload,
  CommentResponse,
} from "../models/comments.models.js"
import {
  ErrorResponse,
  ValidationErrorResponse,
  Unauthorized,
  Forbidden,
  SuccessMessageResponse,
} from "../models/common.models.js"
import { tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"
import * as commentDb from "../routes/v1/comments/database.js"
import { formatComment } from "../routes/v1/util/formatting.js"

@Route("api/v1/comments")
export class CommentsController extends BaseController {
  /**
   * Reply to a comment
   * @summary Create a reply to an existing comment
   */
  @Post("{comment_id}/reply")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(200, "Reply created successfully")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async replyToComment(
    @Path() comment_id: string,
    @Body() payload: CommentReplyPayload,
    @Request() request: ExpressRequest,
  ): Promise<CommentResponse> {
    try {
      const comment = await commentDb.getComment({ comment_id })
      const user = this.getUser(request)

      if (!comment) {
        throw new ValidationErrorClass("Invalid comment")
      }

      const comments = await commentDb.insertComment({
        author: user.user_id,
        content: payload.content,
        reply_to: comment.comment_id,
      })

      const formatted = await formatComment(comments[0])
      return this.success(formatted)
    } catch (error) {
      return this.handleError(error, "replyToComment")
    }
  }

  /**
   * Delete a comment
   * @summary Delete a comment (author or admin only)
   */
  @Post("{comment_id}/delete")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(200, "Comment deleted successfully")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async deleteComment(
    @Path() comment_id: string,
    @Request() request: ExpressRequest,
  ): Promise<SuccessMessageResponse> {
    try {
      const comment = await commentDb.getComment({ comment_id })
      const user = this.getUser(request)

      if (!comment) {
        throw new ValidationErrorClass("Invalid comment")
      }

      if (comment.author !== user.user_id && user.role !== "admin") {
        throw new ForbiddenError("No permissions")
      }

      await commentDb.updateComments({ comment_id }, { deleted: true })
      return this.success({ message: "Success" })
    } catch (error) {
      return this.handleError(error, "deleteComment")
    }
  }

  /**
   * Update a comment
   * @summary Update a comment's content (author or admin only)
   */
  @Post("{comment_id}/update")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(200, "Comment updated successfully")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async updateComment(
    @Path() comment_id: string,
    @Body() payload: CommentUpdatePayload,
    @Request() request: ExpressRequest,
  ): Promise<SuccessMessageResponse> {
    try {
      const comment = await commentDb.getComment({ comment_id })
      const user = this.getUser(request)

      if (!comment) {
        throw new ValidationErrorClass("Invalid comment")
      }

      if (comment.author !== user.user_id && user.role !== "admin") {
        throw new ForbiddenError("No permissions")
      }

      if (!payload.content) {
        throw new ValidationErrorClass("Invalid argument")
      }

      await commentDb.updateComments({ comment_id }, { content: payload.content })
      return this.success({ message: "Success" })
    } catch (error) {
      return this.handleError(error, "updateComment")
    }
  }

  /**
   * Upvote a comment
   * @summary Upvote a comment (toggles if already upvoted)
   */
  @Post("{comment_id}/upvote")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(200, "Comment upvoted successfully")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async upvoteComment(
    @Path() comment_id: string,
    @Request() request: ExpressRequest,
  ): Promise<SuccessMessageResponse> {
    try {
      const comment = await commentDb.getComment({ comment_id })
      const user = this.getUser(request)

      if (!comment) {
        throw new ValidationErrorClass("Invalid comment")
      }

      const vote = await commentDb.getCommentVote({
        actor_id: user.user_id,
        comment_id,
      })
      await commentDb.removeCommentVote({ actor_id: user.user_id, comment_id })
      if (!vote || !vote.upvote) {
        await commentDb.addCommentVote({
          actor_id: user.user_id,
          comment_id,
          upvote: true,
        })
      }

      return this.success({ message: "Success" })
    } catch (error) {
      return this.handleError(error, "upvoteComment")
    }
  }

  /**
   * Downvote a comment
   * @summary Downvote a comment (toggles if already downvoted)
   */
  @Post("{comment_id}/downvote")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(200, "Comment downvoted successfully")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async downvoteComment(
    @Path() comment_id: string,
    @Request() request: ExpressRequest,
  ): Promise<SuccessMessageResponse> {
    try {
      const comment = await commentDb.getComment({ comment_id })
      const user = this.getUser(request)

      if (!comment) {
        throw new ValidationErrorClass("Invalid comment")
      }

      const vote = await commentDb.getCommentVote({
        actor_id: user.user_id,
        comment_id,
      })
      await commentDb.removeCommentVote({ actor_id: user.user_id, comment_id })
      if (!vote || vote.upvote) {
        await commentDb.addCommentVote({
          actor_id: user.user_id,
          comment_id,
          upvote: false,
        })
      }

      return this.success({ message: "Success" })
    } catch (error) {
      return this.handleError(error, "downvoteComment")
    }
  }
}
