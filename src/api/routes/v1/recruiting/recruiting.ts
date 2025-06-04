import express, { NextFunction, Request, Response } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import {
  formatComment,
  formatRecruitingPost,
  FormattedComment,
} from "../util/formatting.js"
import { DBRecruitingPost } from "../../../../clients/database/db-models.js"
import { User } from "../api-models.js"
import { verifiedUser } from "../../../middleware/auth.js"
import { has_permission } from "../util/permissions.js"

export async function contractorRecruiting(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.isAuthenticated()) {
    const {
      contractor: spectrum_id,
    }: {
      contractor: string
    } = req.body

    const user = req.user as User

    let contractor
    try {
      contractor = await database.getContractor({ spectrum_id })
    } catch (e) {
      res.status(400).json({ error: "Invalid contractor" })
      return
    }

    const success = await has_permission(
      contractor.contractor_id,
      user.user_id,
      "manage_recruiting",
    )
    if (!success) {
      res.status(400).json({ error: "Missing permissions" })
      return
    }

    next()
  } else {
    res.status(401).json({ error: "Unauthenticated" })
  }
}

export const recruitingRouter = express.Router()

const sortingMethods = [
  "rating",
  "name",
  "activity",
  "all-time",
  "members",
  "date",
  "post-date",
]

export interface RecruitingSearchQuery {
  sorting: string
  query: string
  rating: number
  index: number
  fields: string[]
  reverseSort: boolean
  pageSize: number
}

export function convertQuery(query: {
  index?: string
  sorting: string
  query: string
  fields: string
  rating: string
  pageSize: string
}): RecruitingSearchQuery {
  const index = +(query.index || 0)
  let sorting = (query.sorting || "name").toLowerCase()
  const reverseSort = sorting.endsWith("-reverse")
  if (reverseSort) {
    sorting = sorting.slice(0, sorting.length - "-reverse".length)
  }

  if (sortingMethods.indexOf(sorting) === -1) {
    sorting = "name"
  }

  const searchQuery = query.query.toLowerCase()
  const fields = query.fields ? query.fields.toLowerCase().split(",") : []
  const rating = +(query.rating || 0)
  const pageSize = +(query.pageSize || 15)
  return {
    index,
    reverseSort,
    sorting,
    query: searchQuery,
    fields,
    rating,
    pageSize,
  }
}

recruitingRouter.get("/posts", async function (req, res) {
  // /posts?index=0&reverseSort=false&sorting=rating&query=&fields=&rating=0
  const query = req.query as {
    index?: string
    reverseSort: string
    sorting: string
    query: string
    fields: string
    rating: string
    pageSize: string
  }

  const searchData = convertQuery(query)

  /*
    SELECT recruiting_posts.*
                    FROM recruiting_posts
                    ORDER BY (SELECT COUNT(*) FROM recruiting_votes rv WHERE rv.post_id = recruiting_posts.post_id)
                    LIMIT 15
                    OFFSET 0;
     */

  let posts: DBRecruitingPost[] = []
  try {
    posts = await database.getAllRecruitingPostsPaginated(searchData)
  } catch (e) {
    console.error(e)
  }
  const counts = await database.getRecruitingPostCount()
  const formatted = await Promise.all(posts.map(formatRecruitingPost))

  res.json({ total: +counts[0].count, items: formatted })
})

recruitingRouter.post(
  "/post/create",
  contractorRecruiting,
  async function (req, res) {
    const {
      title,
      body,
      contractor: spectrum_id,
    }: {
      title: string
      body: string
      contractor: string
    } = req.body

    if (!title || !body || !spectrum_id) {
      res.status(400).json({ error: "Missing required fields" })
      return
    }

    const contractor_obj = await database.getContractor({
      spectrum_id: spectrum_id,
    })
    const last_post = await database.getRecruitingPost({
      contractor_id: contractor_obj.contractor_id,
    })
    if (last_post) {
      res.status(400).json({ error: "Cannot create multiple posts" })
      return
    }

    const posts = await database
      .knex<DBRecruitingPost>("recruiting_posts")
      .insert({ title, body, contractor_id: contractor_obj.contractor_id })
      .returning("*")

    res.json(posts[0])
  },
)

// TODO: Update doesn't need an ID we can just fetch default

recruitingRouter.get("/post/:post_id", async function (req, res) {
  const post_id = req.params["post_id"]
  const post = await database.getRecruitingPost({ post_id })

  if (!post) {
    res.status(400).json({ message: "Invalid post" })
    return
  }

  const formatted = await formatRecruitingPost(post)

  res.json(formatted)
})

recruitingRouter.get("/post/:post_id/comments", async function (req, res) {
  const post_id = req.params["post_id"]
  const post = await database.getRecruitingPost({ post_id })

  if (!post) {
    res.status(400).json({ message: "Invalid post" })
    return
  }

  const comments_raw = await database.getRecruitingPostComments({
    "recruiting_comments.post_id": post.post_id,
    reply_to: null,
  })
  const comments = await Promise.all(comments_raw.map(formatComment))
  comments.sort(
    (a: FormattedComment, b: FormattedComment) =>
      +b.upvotes! - +b.downvotes! - (+a.upvotes! - +a.downvotes!),
  )

  res.json(comments)
})

recruitingRouter.post("/post/:post_id/update", async function (req, res) {
  const user = req.user as User
  const post_id = req.params["post_id"]
  const post = await database.getRecruitingPost({ post_id })

  if (!post) {
    res.status(400).json({ message: "Invalid post" })
    return
  }

  const contractor = await database.getContractor({
    contractor_id: post.contractor_id,
  })
  if (
    !(await has_permission(
      contractor.contractor_id,
      user.user_id,
      "manage_recruiting",
    ))
  ) {
    res.status(400).json({ message: "Missing permissions" })
    return
  }

  const {
    title,
    body,
  }: {
    title: string
    body: string
  } = req.body

  if (!title && !body) {
    res.status(400).json({ error: "Missing required fields" })
    return
  }

  const newValues: { title?: string; body?: string } = {}
  if (title) newValues.title = title
  if (body) newValues.body = body

  const results = await database.updateRecruitingPost({ post_id }, newValues)

  res.json(results[0])
})

recruitingRouter.post(
  "/post/:post_id/upvote",
  verifiedUser,
  async function (req, res) {
    const post_id = req.params["post_id"]
    const post = await database.getRecruitingPost({ post_id })
    const user = req.user as User

    if (!post) {
      res.status(400).json({ message: "Invalid post" })
      return
    }

    const vote = await database.getRecruitingPostVoteWithinWeek({
      actor_id: user.user_id,
      post_id,
    })
    if (!vote) {
      await database.addRecruitingPostVote({
        actor_id: user.user_id,
        post_id,
        upvote: true,
      })
    }

    res.json({ message: "Success!", already_voted: !!vote })
  },
)

recruitingRouter.post(
  "/post/:post_id/comment",
  verifiedUser,
  async function (req, res) {
    const post_id = req.params["post_id"]
    const post = await database.getRecruitingPost({ post_id })
    const user = req.user as User

    if (!post) {
      res.status(400).json({ message: "Invalid post" })
      return
    }

    const {
      content,
      reply_to,
    }: {
      content: string
      reply_to?: string
    } = req.body

    let comments
    if (reply_to) {
      const comment = await database.getComment({ comment_id: reply_to })

      if (!comment) {
        res.status(400).json({ message: "Invalid comment" })
        return
      }

      comments = await database.insertComment({
        author: user.user_id,
        content,
        reply_to,
      })
    } else {
      comments = await database.insertComment({
        author: user.user_id,
        content,
        reply_to,
      })
    }

    await database.insertRecruitingComment({
      post_id,
      comment_id: comments[0].comment_id,
    })

    res.json({ message: "Success!" })
  },
)

recruitingRouter.get("/org/:spectrum_id", async function (req, res) {
  const spectrum_id = req.params["spectrum_id"]
  const contractor = await database.getContractorSafe({ spectrum_id })

  if (!contractor) {
    res.status(400).json({ message: "Invalid contractor" })
    return
  }

  const post = await database.getRecruitingPost({
    contractor_id: contractor.contractor_id,
  })

  if (!post) {
    res.status(400).json({ message: "Invalid post" })
    return
  }

  const formatted = await formatRecruitingPost(post)
  res.json(formatted)
})
