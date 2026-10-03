// JSON Schemas for each client's manifest, written from the clients' docs
// (links in README.md, "Formats"). They are deliberately strict about key
// names so a typo fails here instead of being silently ignored by a client.
// `claude plugin validate` and `gemini extensions validate` run on top of these
// in tests/validators.test.mjs when those CLIs are installed.

const kebab = "^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$";
const relative = "^\\./(?!.*\\.\\.)";
const author = {
  type: "object",
  required: ["name"],
  properties: { name: { type: "string" }, email: { type: "string" }, url: { type: "string" } },
  additionalProperties: false
};
const strings = { type: "array", items: { type: "string" } };

// code.claude.com/docs/en/plugins/marketplace-reference
export const claudeMarketplace = {
  type: "object",
  required: ["name", "owner", "plugins"],
  properties: {
    $schema: { type: "string" },
    name: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" },
    owner: author,
    description: { type: "string" },
    version: { type: "string" },
    metadata: { type: "object" },
    plugins: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["name", "source"],
        properties: {
          name: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" },
          source: { anyOf: [{ type: "string", pattern: relative }, { type: "object", required: ["source"], properties: { source: { type: "string" } } }] },
          description: { type: "string" },
          version: { type: "string" },
          category: { type: "string" },
          tags: strings,
          strict: { type: "boolean" },
          displayName: { type: "string" },
          defaultEnabled: { type: "boolean" }
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

// code.claude.com/docs/en/plugins/manifest-reference
export const claudePlugin = {
  type: "object",
  required: ["name", "version", "description", "author"],
  properties: {
    $schema: { type: "string" },
    name: { type: "string", pattern: kebab },
    displayName: { type: "string" },
    version: { type: "string" },
    description: { type: "string" },
    author,
    homepage: { type: "string", format: "uri" },
    repository: { type: "string" },
    license: { type: "string" },
    keywords: strings
  },
  additionalProperties: false
};

const claudeEvents = [
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "UserPromptSubmit",
  "Stop",
  "SessionEnd"
];

// code.claude.com/docs/en/hooks (command hook fields)
export const claudeHooks = {
  type: "object",
  required: ["hooks"],
  properties: {
    description: { type: "string" },
    hooks: {
      type: "object",
      propertyNames: { enum: claudeEvents },
      additionalProperties: {
        type: "array",
        items: {
          type: "object",
          required: ["hooks"],
          properties: {
            matcher: { type: "string" },
            hooks: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["type", "command"],
                properties: {
                  type: { const: "command" },
                  command: { type: "string", minLength: 1 },
                  args: strings,
                  timeout: { type: "number", exclusiveMinimum: 0 },
                  async: { type: "boolean" },
                  shell: { enum: ["bash", "powershell"] },
                  statusMessage: { type: "string" },
                  if: { type: "string" }
                },
                additionalProperties: false
              }
            }
          },
          additionalProperties: false
        }
      }
    }
  },
  additionalProperties: false
};

// code.claude.com/docs/en/mcp (plugin-provided servers)
export const claudeMcp = {
  type: "object",
  required: ["mcpServers"],
  properties: {
    mcpServers: {
      type: "object",
      additionalProperties: {
        type: "object",
        required: ["type", "url"],
        properties: { type: { enum: ["http", "sse"] }, url: { type: "string", format: "uri" } },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

// developers.openai.com/codex/plugins/build (compatibility manifest + interface)
export const codexPlugin = {
  type: "object",
  required: ["name", "version", "description"],
  properties: {
    name: { type: "string", pattern: kebab },
    version: { type: "string" },
    description: { type: "string" },
    author,
    homepage: { type: "string" },
    repository: { type: "string" },
    license: { type: "string" },
    keywords: strings,
    skills: { type: "string", pattern: relative },
    mcpServers: { type: "string", pattern: relative },
    hooks: { type: "string", pattern: relative },
    interface: {
      type: "object",
      required: ["displayName"],
      properties: {
        displayName: { type: "string" },
        shortDescription: { type: "string" },
        longDescription: { type: "string" },
        developerName: { type: "string" },
        category: { type: "string" },
        capabilities: strings,
        websiteURL: { type: "string", format: "uri" },
        privacyPolicyURL: { type: "string", format: "uri" },
        termsOfServiceURL: { type: "string", format: "uri" },
        defaultPrompt: strings,
        brandColor: { type: "string" },
        composerIcon: { type: "string" },
        logo: { type: "string" },
        screenshots: strings
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

// learn.chatgpt.com/docs/hooks (config shape, events, handler fields)
export const codexHooks = {
  type: "object",
  required: ["hooks"],
  properties: {
    description: { type: "string" },
    hooks: {
      type: "object",
      propertyNames: {
        enum: [
          "PreToolUse",
          "PermissionRequest",
          "PostToolUse",
          "PreCompact",
          "PostCompact",
          "UserPromptSubmit",
          "SubagentStart",
          "SubagentStop",
          "Stop",
          "Interrupt",
          "SessionStart",
          "SessionEnd"
        ]
      },
      additionalProperties: {
        type: "array",
        items: {
          type: "object",
          required: ["hooks"],
          properties: {
            matcher: { type: "string" },
            hooks: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["type", "command"],
                properties: {
                  type: { const: "command" },
                  command: { type: "string", minLength: 1 },
                  commandWindows: { type: "string", minLength: 1 },
                  timeout: { type: "number", exclusiveMinimum: 0 },
                  async: { type: "boolean" },
                  statusMessage: { type: "string" },
                  additionalContextLimit: { type: "integer", minimum: 0 }
                },
                additionalProperties: false
              }
            }
          },
          additionalProperties: false
        }
      }
    }
  },
  additionalProperties: false
};

// developers.openai.com/codex/plugins/build ("Marketplace metadata")
export const codexMarketplace = {
  type: "object",
  required: ["name", "plugins"],
  properties: {
    name: { type: "string", pattern: kebab },
    interface: {
      type: "object",
      properties: { displayName: { type: "string" } },
      additionalProperties: false
    },
    plugins: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["name", "source", "policy", "category"],
        properties: {
          name: { type: "string", pattern: kebab },
          source: {
            type: "object",
            required: ["source", "path"],
            properties: { source: { const: "local" }, path: { type: "string", pattern: relative } },
            additionalProperties: false
          },
          policy: {
            type: "object",
            required: ["installation", "authentication"],
            properties: {
              installation: { enum: ["AVAILABLE", "INSTALLED_BY_DEFAULT", "NOT_AVAILABLE"] },
              authentication: { enum: ["ON_INSTALL", "ON_USE"] }
            },
            additionalProperties: false
          },
          category: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

// cursor.com/docs/reference/plugins (manifest fields)
export const cursorPlugin = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", pattern: "^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$" },
    displayName: { type: "string" },
    description: { type: "string" },
    version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+" },
    author,
    homepage: { type: "string" },
    repository: { type: "string" },
    license: { type: "string" },
    keywords: strings,
    logo: { type: "string" },
    rules: { anyOf: [{ type: "string" }, strings] },
    agents: { anyOf: [{ type: "string" }, strings] },
    skills: { anyOf: [{ type: "string" }, strings] },
    commands: { anyOf: [{ type: "string" }, strings] },
    hooks: { anyOf: [{ type: "string", pattern: relative }, { type: "object" }] },
    mcpServers: {
      anyOf: [
        { type: "string" },
        {
          type: "object",
          additionalProperties: {
            type: "object",
            required: ["url"],
            properties: { url: { type: "string", format: "uri" }, headers: { type: "object" } },
            additionalProperties: false
          }
        }
      ]
    }
  },
  additionalProperties: false
};

// cursor.com/docs/hooks (configuration, per-script options, events)
export const cursorHooks = {
  type: "object",
  required: ["version", "hooks"],
  properties: {
    version: { type: "integer", minimum: 1 },
    hooks: {
      type: "object",
      propertyNames: {
        enum: [
          "sessionStart",
          "sessionEnd",
          "preToolUse",
          "postToolUse",
          "postToolUseFailure",
          "subagentStart",
          "subagentStop",
          "beforeShellExecution",
          "afterShellExecution",
          "beforeMCPExecution",
          "afterMCPExecution",
          "beforeReadFile",
          "afterFileEdit",
          "beforeSubmitPrompt",
          "preCompact",
          "stop",
          "afterAgentResponse",
          "afterAgentThought",
          "beforeTabFileRead",
          "afterTabFileEdit",
          "workspaceOpen"
        ]
      },
      additionalProperties: {
        type: "array",
        items: {
          type: "object",
          required: ["command"],
          properties: {
            command: { type: "string", minLength: 1 },
            type: { enum: ["command", "prompt"] },
            timeout: { type: "number", exclusiveMinimum: 0 },
            loop_limit: { type: ["integer", "null"] },
            failClosed: { type: "boolean" },
            matcher: { type: "string" }
          },
          additionalProperties: false
        }
      }
    }
  },
  additionalProperties: false
};

// cursor.com/docs/reference/plugins ("Marketplace manifest format")
export const cursorMarketplace = {
  type: "object",
  required: ["name", "owner", "plugins"],
  properties: {
    name: { type: "string", pattern: kebab },
    owner: author,
    metadata: {
      type: "object",
      properties: { description: { type: "string" }, version: { type: "string" }, pluginRoot: { type: "string" } },
      additionalProperties: false
    },
    plugins: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["name", "source"],
        properties: {
          name: { type: "string", pattern: kebab },
          source: { anyOf: [{ type: "string" }, { type: "object", required: ["path"], properties: { path: { type: "string" } } }] },
          description: { type: "string" },
          version: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

// geminicli.com/docs/extensions/reference + docs/tools/mcp-server.md
export const geminiExtension = {
  type: "object",
  required: ["name", "version"],
  properties: {
    name: { type: "string", pattern: "^[a-z0-9-]+$" },
    version: { type: "string" },
    description: { type: "string" },
    mcpServers: {
      type: "object",
      additionalProperties: {
        type: "object",
        required: ["httpUrl"],
        properties: { httpUrl: { type: "string", format: "uri" }, headers: { type: "object" } },
        additionalProperties: false
      }
    },
    contextFileName: { type: "string" },
    excludeTools: strings,
    migratedTo: { type: "string" }
  },
  additionalProperties: false
};
