/**
 * Recruiting Controller
 * Handles recruiting post operations
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Route,
  Body,
  Path,
  Query,
  Security,
  Middlewares,
  Response,
  Request,
  SuccessResponse,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController, ValidationErrorClass, ForbiddenError, NotFoundError, ConflictError } from "./base.controller.js"
import {
  RecruitingPost,
  CreateRecruitingPostPayload,
  UpdateRecruitingPostPayload,
  CreateCommentPayload,
  RecruitingPostsListResponse,
  RecruitingPostResponse,
  CommentsListResponse,
  UpvoteResponse,
} from "../models/recruiting.models.js"
import {
  ErrorResponse,
  ValidationErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
  SuccessMessageResponse,
} from "../models/common.models.js"
import { tsoaReadRateLimit, tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"
import * as recruitingDb from "../routes/v1/recruiting/database.js"
import * as contractorDb from "../routes/v1/contractors/database.js"
import * as commentDb from "../routes/v1/comments/database.js"
import { formatRecruitingPost, formatComment, FormattedComment } from "../routes/v1/util/formatting.js"
import { has_permission } from "../routes/v1/util/permissions.js"
import logger from "../../logger/logger.js"

// Base sorting methods (without -reverse suffix)
const baseSortingMethods = [
  "rating",
  "name",
  "activity",
  "all-time",
  "members",
  "date",
  "post-date",
]

// All valid sorting methods including reverse variants
export const sortingMethods = [
  ...baseSortingMethods,
  ...baseSortingMethods.map((method) => `${method}-reverse`),
]

export interface RecruitingSearchQuery {
  sorting: string
  query: string
  rating: number
  index: number
  fields: string[]
  reverseSort: boolean
  pageSize: number
  language_codes?: string[]
}

function convertQuery(query: {
  index?: string
  sorting?: string
  query?: string
  fields?: string
  rating?: string
  pageSize?: string
  language_codes?: string
}): RecruitingSearchQuery {
  const index = +(query.index || 0)
  let sorting = (query.sorting || "name").toLowerCase()
  const reverseSort = sorting.endsWith("-reverse")
  if (reverseSort) {
    sorting = sorting.slice(0, sorting.length - "-reverse".length)
  }

  // Validate against base sorting methods (without -reverse)
  if (baseSortingMethods.indexOf(sorting) === -1) {
    sorting = "name"
  }

  const searchQuery = (query.query || "").toLowerCase()
  const fields = query.fields ? query.fields.toLowerCase().split(",") : []
  const rating = +(query.rating || 0)
  const pageSize = +(query.pageSize || 15)
  const language_codes = query.language_codes
    ? query.language_codes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined
  return {
    index,
    reverseSort,
    sorting,
    query: searchQuery,
    fields,
    rating,
    pageSize,
    language_codes:
      language_codes && language_codes.length > 0 ? language_codes : undefined,
  }
}

@Route("api/v1/recruiting")
export class RecruitingController extends BaseController {
  /**
   * Get recruiting posts
   * @summary Retrieve a paginated list of recruiting posts with search and filtering
   */
  @Get("posts")
  @Middlewares(tsoaReadRateLimit)
  @SuccessResponse(200, "Successfully retrieved recruiting posts")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getPosts(
    @Query() index?: number,
    @Query() sorting?: string,
    @Query() query?: string,
    @Query() fields?: string,
    @Query() rating?: number,
    @Query() pageSize?: number,
    @Query() language_codes?: string,
  ): Promise<RecruitingPostsListResponse> {
    try {
      const searchData = convertQuery({
        index: index?.toString(),
        sorting,
        query,
        fields,
        rating: rating?.toString(),
        pageSize: pageSize?.toString(),
        language_codes,
      })

      let posts: any[] = []
      try {
        posts = await recruitingDb.getAllRecruitingPostsPaginated(searchData)
      } catch (e) {
        this.logError("getPosts", e)
      }
      
      const counts = await recruitingDb.getRecruitingPostCount()
      const formatted = await Promise.all(posts.map(formatRecruitingPost))

      return this.success({ total: +counts[0].count, items: formatted })
    } catch (error) {
      return this.handleError(error, "getPosts")
    }
  }

  /**
   * Create a recruiting post
   * @summary Create a new recruiting post for a contractor
   */
  @Post("posts")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(201, "Recruiting post successfully created")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<Conflict>(409, "Conflict")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async createPost(
    @Body() payload: CreateRecruitingPostPayload,
    @Request() request: ExpressRequest,
  ): Promise<RecruitingPostResponse> {
    try {
      const user = this.getUser(request)

      if (!payload.title || !payload.body || !payload.contractor) {
        throw new ValidationErrorClass("Missing required fields")
      }

      const contractor_obj = await contractorDb.getContractor({
        spectrum_id: payload.contractor,
      })
      
      if (!contractor_obj) {
        throw new ValidationErrorClass("Invalid contractor")
      }

      if (contractor_obj.archived) {
        throw new ConflictError(
          "Archived organizations cannot create recruiting posts"
        )
      }

      // Check permissions
      const hasPermission = await has_permission(
        contractor_obj.contractor_id,
        user.user_id,
        "manage_recruiting",
      )
      if (!hasPermission) {
        throw new ForbiddenError("Missing permissions to manage recruiting")
      }

      const last_post = await recruitingDb.getRecruitingPost({
        contractor_id: contractor_obj.contractor_id,
      })
      if (last_post) {
        throw new ConflictError("Cannot create multiple posts")
      }

// @ts-expect-error - Module exists but not yet compiled
      const { database } = await import("../../../clients/database/knex-db.js")
      const posts = await database
        .knex("recruiting_posts")
        .insert({ 
          title: payload.title, 
          body: payload.body, 
          contractor_id: contractor_obj.contractor_id 
        })
        .returning("*")

      const formatted = await formatRecruitingPost(posts[0])
      return this.success(formatted)
    } catch (error) {
      return this.handleError(error, "createPost")
    }
  }

  /**
   * Get recruiting post by ID
   * @summary Retrieve a specific recruiting post by its ID
   */
  @Get("posts/{post_id}")
  @Middlewares(tsoaReadRateLimit)
  @SuccessResponse(200, "Successfully retrieved recruiting post")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getPostById(
    @Path() post_id: string,
  ): Promise<RecruitingPostResponse> {
    try {
      const post = await recruitingDb.getRecruitingPost({ post_id })

      if (!post) {
        throw new NotFoundError("Recruiting post not found")
      }

      const formatted = await formatRecruitingPost(post)
      return this.success(formatted)
    } catch (error) {
      return this.handleError(error, "getPostById")
    }
  }

  /**
   * Get recruiting post comments
   * @summary Retrieve all comments for a specific recruiting post
   */
  @Get("posts/{post_id}/comments")
  @Middlewares(tsoaReadRateLimit)
  @SuccessResponse(200, "Successfully retrieved comments")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getPostComments(
    @Path() post_id: string,
  ): Promise<CommentsListResponse> {
    try {
      const post = await recruitingDb.getRecruitingPost({ post_id })

      if (!post) {
        throw new NotFoundError("Recruiting post not found")
      }

      const comments_raw = await recruitingDb.getRecruitingPostComments({
        "recruiting_comments.post_id": post.post_id,
        reply_to: null,
      })
      const comments = await Promise.all(comments_raw.map(formatComment))
      comments.sort(
        (a: FormattedComment, b: FormattedComment) =>
          +b.upvotes! - +b.downvotes! - (+a.upvotes! - +a.downvotes!),
      )

      return this.success(comments)
    } catch (error) {
      return this.handleError(error, "getPostComments")
    }
  }

  /**
   * Update recruiting post
   * @summary Update a recruiting post's title and/or body
   */
  @Put("posts/{post_id}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(200, "Successfully updated recruiting post")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<Conflict>(409, "Conflict")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async updatePost(
    @Path() post_id: string,
    @Body() payload: UpdateRecruitingPostPayload,
    @Request() request: ExpressRequest,
  ): Promise<RecruitingPostResponse> {
    try {
      const user = this.getUser(request)
      const post = await recruitingDb.getRecruitingPost({ post_id })

      if (!post) {
        throw new ValidationErrorClass("Invalid post")
      }

      const contractor = await contractorDb.getContractor({
        contractor_id: post.contractor_id,
      })
      
      if (contractor.archived) {
        throw new ConflictError(
          "Archived organizations cannot update recruiting posts"
        )
      }
      
      if (
        !(await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_recruiting",
        ))
      ) {
        throw new ForbiddenError("Missing permissions")
      }

      if (!payload.title && !payload.body) {
        throw new ValidationErrorClass("Missing required fields")
      }

      const newValues: { title?: string; body?: string } = {}
      if (payload.title) newValues.title = payload.title
      if (payload.body) newValues.body = payload.body

      const [result] = await recruitingDb.updateRecruitingPost(
        { post_id },
        newValues,
      )

      const formatted = await formatRecruitingPost(result)
      return this.success(formatted)
    } catch (error) {
      return this.handleError(error, "updatePost")
    }
  }

  /**
   * Upvote recruiting post
   * @summary Upvote a recruiting post (once per week)
   */
  @Post("posts/{post_id}/upvote")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(200, "Successfully upvoted post")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async upvotePost(
    @Path() post_id: string,
    @Request() request: ExpressRequest,
  ): Promise<UpvoteResponse> {
    try {
      const post = await recruitingDb.getRecruitingPost({ post_id })
      const user = this.getUser(request)

      if (!post) {
        throw new ValidationErrorClass("Invalid post")
      }

      const vote = await recruitingDb.getRecruitingPostVoteWithinWeek({
        actor_id: user.user_id,
        post_id,
      })
      
      if (!vote) {
        await recruitingDb.addRecruitingPostVote({
          actor_id: user.user_id,
          post_id,
          upvote: true,
        })
      }

      return { message: "Success!", already_voted: !!vote }
    } catch (error) {
      return this.handleError(error, "upvotePost")
    }
  }

  /**
   * Comment on recruiting post
   * @summary Add a comment to a recruiting post
   */
  @Post("posts/{post_id}/comment")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(200, "Successfully added comment")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async commentOnPost(
    @Path() post_id: string,
    @Body() payload: CreateCommentPayload,
    @Request() request: ExpressRequest,
  ): Promise<SuccessMessageResponse> {
    try {
      const post = await recruitingDb.getRecruitingPost({ post_id })
      const user = this.getUser(request)

      if (!post) {
        throw new ValidationErrorClass("Invalid post")
      }

      let comments
      if (payload.reply_to) {
        const comment = await commentDb.getComment({ comment_id: payload.reply_to })

        if (!comment) {
          throw new ValidationErrorClass("Invalid comment")
        }

        comments = await recruitingDb.insertComment({
          author: user.user_id,
          content: payload.content,
          reply_to: payload.reply_to,
        })
      } else {
        comments = await recruitingDb.insertComment({
          author: user.user_id,
          content: payload.content,
          reply_to: null,
        })
      }

      await recruitingDb.insertRecruitingComment({
        post_id,
        comment_id: comments[0].comment_id,
      })

      return this.success({ message: "Success!" })
    } catch (error) {
      return this.handleError(error, "commentOnPost")
    }
  }

  /**
   * Get recruiting post by contractor
   * @summary Retrieve the recruiting post for a specific contractor
   */
  @Get("contractors/{spectrum_id}/posts")
  @Middlewares(tsoaReadRateLimit)
  @SuccessResponse(200, "Successfully retrieved recruiting post")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getPostByContractor(
    @Path() spectrum_id: string,
  ): Promise<RecruitingPostResponse> {
    try {
      // First get the contractor
      const contractor = await contractorDb.getContractor({ spectrum_id })

      if (!contractor) {
        throw new NotFoundError("Contractor not found")
      }

      // Then get the recruiting post for this contractor
      const post = await recruitingDb.getRecruitingPost({
        contractor_id: contractor.contractor_id,
      })

      if (!post) {
        throw new NotFoundError("Recruiting post not found for contractor")
      }

      const formatted = await formatRecruitingPost(post)
      return this.success(formatted)
    } catch (error) {
      return this.handleError(error, "getPostByContractor")
    }
  }
}
