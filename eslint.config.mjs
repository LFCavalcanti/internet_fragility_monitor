import nextPlugin from "@next/eslint-plugin-next";

export default [
  nextPlugin.configs["core-web-vitals"],
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "node_modules/**",
      "*.db",
      "*.af*",
      "update-logos.mjs",
      "check-db.js",
    ],
  },
];
