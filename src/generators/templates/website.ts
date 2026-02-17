/**
 * Website content templates - re-export module
 * Backward compatibility: all functions are available from their new homes
 * but can still be imported from this file
 */

// Landing page (10-section redesign)
export { generateWebsiteLandingPage, generateWebsiteLandingPageWithInfo } from './website-landing.js';
export type { LandingPageResult } from './website-landing.js';

// Pricing page (with toggle + comparison)
export { generateWebsitePricingPage } from './website-pricing.js';

// Layout, CSS, utility pages
export {
  generateWebsiteLayout,
  generateWebsiteGlobalsCss,
  generateWebsiteSitemap,
  generateWebsiteRobots,
  generateWebsiteReadme,
  generateWebsiteSpec,
  generateWebsiteTest,
  generateWebsiteDocsPage,
  generateWebsiteBlogPage,
} from './website-layout.js';

// Reusable section generators
export {
  mapFeatureIcon,
  isNumericMetric,
  generatePainPointsSection,
  generateDifferentiatorsSection,
  generateHowItWorksSection,
  generateStatsSection,
  generateSocialProofSection,
  generatePricingTeaserSection,
  generateFaqSection,
} from './website-sections.js';
export type { SectionRenderInfo } from './website-sections.js';
