/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// See https://docusaurus.io/docs/site-config for all the possible
// site configuration options.

// List of projects/orgs using your project for the users page.
const users = [
];

const siteConfig = {
    title: "Cookie Cutter", // Title for your website.
    tagline: "A framework for building scalable microservices",
    url: "https://walmartlabs.github.io", // Your website URL
    baseUrl: "/cookie-cutter/", // Base URL for your project */
    // For github.io type URLs, you would set the url and baseUrl like:
    //   url: 'https://facebook.github.io',
    //   baseUrl: '/test-site/',

    // Used for publishing and more
    projectName: "cookie-cutter",
    organizationName: "walmartlabs",
    // For top-level user or org sites, the organization is still the same.
    // e.g., for the https://JoelMarcey.github.io site, it would be set like...
    //   organizationName: 'JoelMarcey'

    // For no header links in the top nav bar -> headerLinks: [],
    headerLinks: [
    {doc: 'intro-getting-started', label: 'Introduction'},
    {doc: 'intro-inputs', label: 'API'},
    {page: 'help', label: 'Help'},
    ],

    // If you have users set above, you add it here:
    users,

    /* path to images for header/footer */
  headerIcon: 'img/cookie.svg',
  footerIcon: 'img/cookie.svg',
  favicon: 'img/favicon.png',

    /* Colors for website */
    colors: {
    primaryColor: '#2E8555',
    secondaryColor: '#205C3B',
    },

    /* Custom fonts for website */
    /*
  fonts: {
    myFont: [
      "Times New Roman",
      "Serif"
    ],
    myOtherFont: [
      "-apple-system",
      "system-ui"
    ]
  },
  */

    // This copyright info is used in /core/Footer.js and blog RSS/Atom feeds.
    copyright: `Copyright © ${new Date().getFullYear()} Walmart Inc.`,

    highlight: {
        // Highlight.js theme to use for syntax highlighting in code blocks.
    theme: 'vs',
    },

    // Add custom scripts here that would be placed in <script> tags.
  scripts: ['https://buttons.github.io/buttons.js'],

    // On page navigation for the current documentation page.
  onPageNav: 'separate',
    // No .html extensions for paths.
    cleanUrl: true,

    // Open Graph and Twitter card images.
  ogImage: 'img/docusaurus.png',
  twitterImage: 'img/docusaurus.png',

    // Show documentation's last contributor's name.
    // enableUpdateBy: true,

    // Show documentation's last update time.
    // enableUpdateTime: true,

    // You may provide arbitrary config keys to be used as needed by your
    // template. For example, if you need your repo's URL...
    //   repoUrl: 'https://github.com/facebook/test-site',
};

module.exports = siteConfig;
