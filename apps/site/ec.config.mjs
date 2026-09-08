export default {
  themes: ["github-light", "github-dark"],
  styleOverrides: {
    borderRadius: "0.75rem",
    codeFontSize: "0.84rem",
    codeFontFamily: '"JetBrains Mono", monospace',
  },
  plugins: [{
    name: "Keyboard-accessible code regions",
    hooks: {
      postprocessRenderedBlock: ({ codeBlock, renderData }) => {
        const index = codeBlock.parentDocument?.positionInDocument?.groupIndex ?? 0;
        const visit = (node) => {
          if (node.type === "element" && node.tagName === "pre") {
            node.properties.tabIndex = 0;
            node.properties.role = "region";
            node.properties.ariaLabel = `Code example ${index + 1}`;
          }
          for (const child of node.children ?? []) visit(child);
        };
        visit(renderData.blockAst);
      },
    },
  }],
};
