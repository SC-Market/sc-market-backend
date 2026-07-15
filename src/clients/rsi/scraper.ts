import * as cheerio from "cheerio"
import winston from "winston"
import logger from "../../logger/logger.js"

const name_selector = "strong.value:nth-child(1)"
const handle_selector =
  ".profile > div:nth-child(2) > div:nth-child(2) > p:nth-child(2) > strong:nth-child(2)"
const bio_selector =
  "html body div#bodyWrapper div.page-wrapper div#contentbody.public-profile.public-profile-landing div#profile.wrapper div#public-profile.account-profile div.profile-content.overview-content.clearfix div.right-col div.inner div.entry.bio div.value"
const img_selector =
  ".profile > div:nth-child(2) > div:nth-child(1) > img:nth-child(1)"

export async function fetchRSIProfileDirect(username: string) {
  const result = await fetch(
    `https://robertsspaceindustries.com/citizens/${encodeURIComponent(
      username,
    )}`,
  )

  const text = await result.text()

  const doc = cheerio.load(text)
  try {
    return {
      handle: doc(handle_selector).text(),
      display_name: doc(name_selector).text(),
      biography: doc(bio_selector).text(),
      profile_image: `https://robertsspaceindustries.com${doc(
        img_selector,
      ).attr("src")}`,
    }
  } catch (e) {
    logger.error(`Failed to parse profile directly ${e}`)
    return null
  }
}

const thumb_pattern = /<div class="thumb">\s*<img src="(.*?)">/
const thumb_regex = new RegExp(thumb_pattern)

export interface RSIOrgData {
  name: string
  sid: string
  headline: string
  manifesto: string
  charter: string
  history: string
  logo: string
  banner: string
  members: number
}

export async function fetchRSIOrgDirect(spectrum_id: string): Promise<RSIOrgData | null> {
  const result = await fetch(
    `https://robertsspaceindustries.com/orgs/${encodeURIComponent(spectrum_id)}`,
  )

  if (!result.ok) {
    logger.error(`Failed to fetch RSI org page: ${result.status}`)
    return null
  }

  const text = await result.text()
  const doc = cheerio.load(text)

  try {
    const headline = doc(".body.markitup-text").first().text().trim()
    const history = doc("#tab-history .markitup-text").text().trim()
    const manifesto = doc("#tab-manifesto .markitup-text").text().trim()
    const charter = doc("#tab-charter .markitup-text").text().trim()

    const nameMatch = text.match(/<h1>\s*(.*?)\s*\/\s*<span/)
    const name = nameMatch ? nameMatch[1].replace(/<[^>]*>/g, "").trim() : spectrum_id

    const membersMatch = text.match(/<span class="count">(\d+)\s*members?<\/span>/)
    const members = membersMatch ? parseInt(membersMatch[1], 10) : 1

    const logoEl = doc(".logo img").attr("src") || ""
    const logo = logoEl.startsWith("http") ? logoEl : logoEl ? `https://robertsspaceindustries.com${logoEl}` : ""

    const bannerEl = doc(".banner img").attr("src") || ""
    const banner = bannerEl.startsWith("http") ? bannerEl : bannerEl ? `https://robertsspaceindustries.com${bannerEl}` : ""

    return { name, sid: spectrum_id.toUpperCase(), headline, manifesto, charter, history, logo, banner, members }
  } catch (e) {
    logger.error(`Failed to parse org page for ${spectrum_id}: ${e}`)
    return null
  }
}

const size_pattern = /<span class="count">(\d+) members<\/span>/
const size_regex = new RegExp(size_pattern)

const name_pattern = /<h1>\s*(.*?) \/ <span/
const name_regex = new RegExp(name_pattern)
