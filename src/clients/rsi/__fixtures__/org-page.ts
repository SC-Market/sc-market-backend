/**
 * Minimal stand-ins for robertsspaceindustries.com/orgs/<SID> pages.
 *
 * Trimmed by hand from real responses down to just the markup the selectors in
 * scraper.ts traverse — the heading block (banner, logo, member count, h1) and
 * the three description tabs. The full pages are ~60 KB and carry per-session
 * CSRF tokens, so they are deliberately not checked in verbatim.
 *
 * If a scraper test starts failing, first check whether RSI changed its markup:
 * re-fetch the real page and diff the structure below against it, rather than
 * loosening the assertions.
 */

/** Builds a page in RSI's layout. Whitespace is irregular on purpose — the real
 * pages are tab-indented ERB output, and the selectors have to survive it. */
function orgPage(opts: {
  sid: string
  displayName: string
  members: number
  headline: string
  history: string
  manifesto: string
  charter: string
}): string {
  return `<!DOCTYPE html>
<html><body><div id="bodyWrapper"><div class="page-wrapper">
<div id="contentbody" class="public profile">
<div id="organization" class="public">
	<div class="wrapper">
	<div class="content-wrapper">
	  <div class="heading ">
	<div class="banner"><img src="/media/420e9238f1804r/banner/${opts.sid}-Banner.jpg" /></div>
	<div class="inner">
		<div class="logo noshadow">
			<img src="/media/3i0ohk9q1nmmlr/logo/${opts.sid}-Logo.png" />
			<span class="count">${opts.members} members</span>
		</div>
		<h1>${opts.displayName} / <span class="symbol">${opts.sid}</span></h1>
	</div>
	  </div>

	  	<div class="frame top"></div>
	  	<div class="body markitup-text">${opts.headline}</div>
	  	<div class="frame bottom"></div>

	  <div class="content block description">
	  	<div class="nav clearfix">
		  	<a href="#history" class="history active js-show-description-content" data-content_id="tab-history">
		  		<strong><span>History</span></strong>
		  	</a>
		  	<a href="#manifesto" class="manifesto js-show-description-content" data-content_id="tab-manifesto">
		  		<strong><span>Manifesto</span></strong>
		  	</a>
		  	<a href="#charter" class="charter js-show-description-content" data-content_id="tab-charter">
		  		<strong><span>Charter</span></strong>
		  	</a>
	  	</div>

	  	<div class="content-tab-wrapper">
		  	<div class="content-tab active" id="tab-history">
		  		<h2 class="tab-title">History</h2>
		  		<div class="markitup-text">${opts.history}</div>
		  	</div>

		  	<div class="content-tab" id="tab-manifesto">
		  		<h2 class="tab-title">Manifesto</h2>
		  		<div class="markitup-text">${opts.manifesto}</div>
		  	</div>

		  	<div class="content-tab" id="tab-charter">
		  		<h2 class="tab-title">Charter</h2>
		  		<div class="markitup-text">${opts.charter}</div>
		  	</div>
	  	</div>
	  </div>
	</div>
	</div>
</div>
</div></div></div></body></html>`
}

/** Org whose verification code lives in the manifesto and charter, not the
 * headline — this is the shape the ownership-verification flow relies on. */
export const SHIN_ORG_PAGE = orgPage({
  sid: "SHIN",
  displayName: "Shin",
  members: 33,
  headline:
    '<h1>Welcome to <span class="caps">SHIN</span></h1>\n\n<p>[sc-market.space:0917A00D]</p>',
  history:
    "Shin is an organization that has persisted through many games.\n<ul>\n\t<li>Dune Awakening</li>\n</ul>",
  manifesto: "<p>[sc-market.space:0917A00D]</p>",
  charter: "<p>[sc-market.space:0917A00D]</p>",
})

/** Org with a display name that differs from its SID, an empty manifesto and an
 * empty charter — the scraper must still return "" rather than undefined. */
export const DEICOMPANY_ORG_PAGE = orgPage({
  sid: "DEICOMPANY",
  displayName: "SC Market",
  members: 10,
  headline:
    "<p>SC Market is a marketplace for facilitating exchange between Star Citizen orgs and players.</p>",
  history:
    '<h2><a href="https://sc-market.space/#/" title="SC Market">SC Market</a></h2>\n\n<p>SC Market is a marketplace.</p>',
  manifesto: "",
  charter: "",
})
