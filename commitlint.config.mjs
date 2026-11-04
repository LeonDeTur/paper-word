import { containsCyrillic } from "./scripts/repository-policy.mjs";

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "english-only": (parsed) => [
          !containsCyrillic(
            [parsed.header, parsed.body, parsed.footer]
              .filter(Boolean)
              .join("\n"),
          ),
          "Write commit messages in English without Cyrillic characters.",
        ],
      },
    },
  ],
  rules: {
    "english-only": [2, "always"],
    "subject-case": [0],
    "header-max-length": [2, "always", 120],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
