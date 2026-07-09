// The 100-app research set, verbatim from the assignment brief.
// `hint` is the website/docs hint given in the brief — the agent starts there but must verify.

export interface AppEntry {
  id: number;
  name: string;
  category: string;
  hint: string;
}

export const CATEGORIES = [
  "CRM & Sales",
  "Support & Helpdesk",
  "Communications & Messaging",
  "Marketing, Ads, Email & Social",
  "Ecommerce",
  "Data, SEO & Scraping",
  "Developer, Infra & Data platforms",
  "Productivity & Project Management",
  "Finance & Fintech",
  "AI, Research & Media-native",
] as const;

export const APPS: AppEntry[] = [
  // 1. CRM & Sales
  { id: 1, name: "Salesforce", category: "CRM & Sales", hint: "salesforce.com" },
  { id: 2, name: "HubSpot", category: "CRM & Sales", hint: "hubspot.com" },
  { id: 3, name: "Pipedrive", category: "CRM & Sales", hint: "pipedrive.com" },
  { id: 4, name: "Attio", category: "CRM & Sales", hint: "attio.com" },
  { id: 5, name: "Twenty", category: "CRM & Sales", hint: "twenty.com (open-source CRM)" },
  { id: 6, name: "Podio", category: "CRM & Sales", hint: "podio.com" },
  { id: 7, name: "Zoho CRM", category: "CRM & Sales", hint: "zoho.com/crm" },
  { id: 8, name: "Close", category: "CRM & Sales", hint: "close.com" },
  { id: 9, name: "Copper", category: "CRM & Sales", hint: "copper.com" },
  { id: 10, name: "DealCloud", category: "CRM & Sales", hint: "api.docs.dealcloud.com" },

  // 2. Support & Helpdesk
  { id: 11, name: "Zendesk", category: "Support & Helpdesk", hint: "zendesk.com" },
  { id: 12, name: "Intercom", category: "Support & Helpdesk", hint: "intercom.com" },
  { id: 13, name: "Freshdesk", category: "Support & Helpdesk", hint: "freshdesk.com" },
  { id: 14, name: "Front", category: "Support & Helpdesk", hint: "front.com" },
  { id: 15, name: "Pylon", category: "Support & Helpdesk", hint: "usepylon.com" },
  { id: 16, name: "LiveAgent", category: "Support & Helpdesk", hint: "liveagent.com" },
  { id: 17, name: "Plain", category: "Support & Helpdesk", hint: "plain.com" },
  { id: 18, name: "Help Scout", category: "Support & Helpdesk", hint: "helpscout.com" },
  { id: 19, name: "Gorgias", category: "Support & Helpdesk", hint: "gorgias.com" },
  { id: 20, name: "Gladly", category: "Support & Helpdesk", hint: "gladly.com" },

  // 3. Communications & Messaging
  { id: 21, name: "Slack", category: "Communications & Messaging", hint: "slack.com" },
  { id: 22, name: "Twilio", category: "Communications & Messaging", hint: "twilio.com" },
  { id: 23, name: "Zoho Cliq", category: "Communications & Messaging", hint: "zoho.com/cliq" },
  { id: 24, name: "Lark (Larksuite)", category: "Communications & Messaging", hint: "open.larksuite.com" },
  { id: 25, name: "Pumble", category: "Communications & Messaging", hint: "pumble.com" },
  { id: 26, name: "Discord", category: "Communications & Messaging", hint: "discord.com" },
  { id: 27, name: "Telegram", category: "Communications & Messaging", hint: "core.telegram.org" },
  { id: 28, name: "WhatsApp Business", category: "Communications & Messaging", hint: "developers.facebook.com/docs/whatsapp" },
  { id: 29, name: "Aircall", category: "Communications & Messaging", hint: "aircall.io" },
  { id: 30, name: "Vonage", category: "Communications & Messaging", hint: "developer.vonage.com" },

  // 4. Marketing, Ads, Email & Social
  { id: 31, name: "Google Ads", category: "Marketing, Ads, Email & Social", hint: "developers.google.com/google-ads" },
  { id: 32, name: "Meta Ads", category: "Marketing, Ads, Email & Social", hint: "developers.facebook.com/docs/marketing-apis" },
  { id: 33, name: "LinkedIn Ads", category: "Marketing, Ads, Email & Social", hint: "learn.microsoft.com/linkedin/marketing" },
  { id: 34, name: "GoHighLevel", category: "Marketing, Ads, Email & Social", hint: "highlevel.stoplight.io" },
  { id: 35, name: "Mailchimp", category: "Marketing, Ads, Email & Social", hint: "mailchimp.com/developer" },
  { id: 36, name: "Klaviyo", category: "Marketing, Ads, Email & Social", hint: "developers.klaviyo.com" },
  { id: 37, name: "systeme.io", category: "Marketing, Ads, Email & Social", hint: "systeme.io (funnel builder)" },
  { id: 38, name: "Pinterest", category: "Marketing, Ads, Email & Social", hint: "developers.pinterest.com" },
  { id: 39, name: "Threads (Meta)", category: "Marketing, Ads, Email & Social", hint: "developers.facebook.com/docs/threads" },
  { id: 40, name: "SendGrid", category: "Marketing, Ads, Email & Social", hint: "sendgrid.com" },

  // 5. Ecommerce
  { id: 41, name: "Shopify", category: "Ecommerce", hint: "shopify.dev" },
  { id: 42, name: "WooCommerce", category: "Ecommerce", hint: "woocommerce.com/document/woocommerce-rest-api" },
  { id: 43, name: "BigCommerce", category: "Ecommerce", hint: "developer.bigcommerce.com" },
  { id: 44, name: "Salesforce Commerce Cloud", category: "Ecommerce", hint: "developer.salesforce.com/docs/commerce" },
  { id: 45, name: "Magento (Adobe Commerce)", category: "Ecommerce", hint: "developer.adobe.com/commerce" },
  { id: 46, name: "Squarespace", category: "Ecommerce", hint: "developers.squarespace.com" },
  { id: 47, name: "Ecwid", category: "Ecommerce", hint: "api-docs.ecwid.com" },
  { id: 48, name: "Gumroad", category: "Ecommerce", hint: "gumroad.com/api" },
  { id: 49, name: "Amazon Selling Partner", category: "Ecommerce", hint: "developer-docs.amazon.com/sp-api" },
  { id: 50, name: "fanbasis", category: "Ecommerce", hint: "fanbasis.com" },

  // 6. Data, SEO & Scraping
  { id: 51, name: "DataForSEO", category: "Data, SEO & Scraping", hint: "docs.dataforseo.com" },
  { id: 52, name: "SE Ranking", category: "Data, SEO & Scraping", hint: "seranking.com/api" },
  { id: 53, name: "Ahrefs", category: "Data, SEO & Scraping", hint: "ahrefs.com/api" },
  { id: 54, name: "MrScraper", category: "Data, SEO & Scraping", hint: "docs.mrscraper.com" },
  { id: 55, name: "Apify", category: "Data, SEO & Scraping", hint: "docs.apify.com" },
  { id: 56, name: "Firecrawl", category: "Data, SEO & Scraping", hint: "firecrawl.dev" },
  { id: 57, name: "Bright Data", category: "Data, SEO & Scraping", hint: "brightdata.com" },
  { id: 58, name: "Sherlock", category: "Data, SEO & Scraping", hint: "github.com/sherlock-project/sherlock" },
  { id: 59, name: "Waterfall.io", category: "Data, SEO & Scraping", hint: "waterfall.io (contact/company intel)" },
  { id: 60, name: "Clay", category: "Data, SEO & Scraping", hint: "clay.com" },

  // 7. Developer, Infra & Data platforms
  { id: 61, name: "GitHub", category: "Developer, Infra & Data platforms", hint: "docs.github.com/rest" },
  { id: 62, name: "Vercel", category: "Developer, Infra & Data platforms", hint: "vercel.com/docs/rest-api" },
  { id: 63, name: "Netlify", category: "Developer, Infra & Data platforms", hint: "docs.netlify.com/api" },
  { id: 64, name: "Cloudflare", category: "Developer, Infra & Data platforms", hint: "developers.cloudflare.com/api" },
  { id: 65, name: "Supabase", category: "Developer, Infra & Data platforms", hint: "supabase.com/docs" },
  { id: 66, name: "Neo4j", category: "Developer, Infra & Data platforms", hint: "neo4j.com/docs/api" },
  { id: 67, name: "Snowflake", category: "Developer, Infra & Data platforms", hint: "docs.snowflake.com" },
  { id: 68, name: "MongoDB Atlas", category: "Developer, Infra & Data platforms", hint: "mongodb.com/docs/atlas/api" },
  { id: 69, name: "Datadog", category: "Developer, Infra & Data platforms", hint: "docs.datadoghq.com/api" },
  { id: 70, name: "Sentry", category: "Developer, Infra & Data platforms", hint: "docs.sentry.io/api" },

  // 8. Productivity & Project Management
  { id: 71, name: "Notion", category: "Productivity & Project Management", hint: "developers.notion.com" },
  { id: 72, name: "Airtable", category: "Productivity & Project Management", hint: "airtable.com/developers" },
  { id: 73, name: "Linear", category: "Productivity & Project Management", hint: "developers.linear.app" },
  { id: 74, name: "Jira", category: "Productivity & Project Management", hint: "developer.atlassian.com" },
  { id: 75, name: "Asana", category: "Productivity & Project Management", hint: "developers.asana.com" },
  { id: 76, name: "Monday.com", category: "Productivity & Project Management", hint: "developer.monday.com" },
  { id: 77, name: "ClickUp", category: "Productivity & Project Management", hint: "clickup.com/api" },
  { id: 78, name: "Coda", category: "Productivity & Project Management", hint: "coda.io/developers" },
  { id: 79, name: "Smartsheet", category: "Productivity & Project Management", hint: "smartsheet.com/developers" },
  { id: 80, name: "Harvest", category: "Productivity & Project Management", hint: "harvestapp.com (help.getharvest.com/api-v2)" },

  // 9. Finance & Fintech
  { id: 81, name: "Stripe", category: "Finance & Fintech", hint: "stripe.com/docs/api" },
  { id: 82, name: "Plaid", category: "Finance & Fintech", hint: "plaid.com/docs" },
  { id: 83, name: "Binance", category: "Finance & Fintech", hint: "binance-docs.github.io" },
  { id: 84, name: "Paygent Connect", category: "Finance & Fintech", hint: "paygent (NMI-powered)" },
  { id: 85, name: "iPayX", category: "Finance & Fintech", hint: "ipayx.ai/docs" },
  { id: 86, name: "QuickBooks", category: "Finance & Fintech", hint: "developer.intuit.com" },
  { id: 87, name: "Xero", category: "Finance & Fintech", hint: "developer.xero.com" },
  { id: 88, name: "Brex", category: "Finance & Fintech", hint: "developer.brex.com" },
  { id: 89, name: "Ramp", category: "Finance & Fintech", hint: "docs.ramp.com" },
  { id: 90, name: "PitchBook", category: "Finance & Fintech", hint: "pitchbook.com (research API)" },

  // 10. AI, Research & Media-native
  { id: 91, name: "NotebookLM", category: "AI, Research & Media-native", hint: "cloud.google.com/gemini (Enterprise API)" },
  { id: 92, name: "Otter AI", category: "AI, Research & Media-native", hint: "help.otter.ai (MCP server)" },
  { id: 93, name: "Fathom", category: "AI, Research & Media-native", hint: "fathom.video" },
  { id: 94, name: "Consensus", category: "AI, Research & Media-native", hint: "consensus.app (OAuth requested)" },
  { id: 95, name: "Reducto", category: "AI, Research & Media-native", hint: "reducto.ai (document parsing)" },
  { id: 96, name: "Devin", category: "AI, Research & Media-native", hint: "docs.devin.ai (MCP)" },
  { id: 97, name: "higgsfield", category: "AI, Research & Media-native", hint: "higgsfield.ai/cli (content suite)" },
  { id: 98, name: "Mermaid CLI", category: "AI, Research & Media-native", hint: "github.com/mermaid-js/mermaid-cli" },
  { id: 99, name: "YouTube Transcript", category: "AI, Research & Media-native", hint: "transcriptapi.com" },
  { id: 100, name: "Grain", category: "AI, Research & Media-native", hint: "grain.com (meeting notes)" },
];
