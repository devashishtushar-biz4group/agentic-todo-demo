import baseConfig from "./eslint.config.js";

export default [
  ...baseConfig,
  {
    rules: {
      complexity: ["error", 10],
      "max-depth": ["error", 4],
      "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
];
