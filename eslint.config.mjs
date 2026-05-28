import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**"],
  },
  {
    rules: {
      // Resetting state at the start of an effect (before an async operation)
      // is a valid React 18 pattern — automatic batching means no extra renders.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
