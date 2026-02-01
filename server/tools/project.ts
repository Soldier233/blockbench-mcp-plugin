/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool } from "@/lib/factories";
import { STATUS_STABLE } from "@/lib/constants";

// Supported project file extensions
const PROJECT_EXTENSIONS = [".bbmodel", ".json", ".geo.json", ".mcmodel", ".jem", ".jpm"];

export function registerProjectTools() {
  createTool(
    "create_project",
    {
      description: "Creates a new project with the given name and project type.",
      annotations: {
        title: "Create Project",
        destructiveHint: true,
        openWorldHint: true,
      },
      parameters: z.object({
        name: z.string(),
        format: z
          .enum(Object.keys(Formats) as [string, ...string[]])
          .default("bedrock_block"),
      }),
      async execute({ name, format }) {
        const created = newProject(Formats[format]);

        if (!created) {
          throw new Error("Failed to create project.");
        }

        Project!.name = name;

        return `Created project with name "${name}" (UUID: ${Project?.uuid}) and format "${format}".`;
      },
    },
    STATUS_STABLE
  );

  createTool(
    "open_project",
    {
      description: "Opens a Blockbench project file (.bbmodel, .json, .geo.json, etc.).",
      annotations: {
        title: "Open Project",
        destructiveHint: true,
        openWorldHint: true,
      },
      parameters: z.object({
        path: z.string().describe("The file path to the project file to open."),
      }),
      async execute({ path }) {
        // @ts-ignore - fs is available via requireNativeModule shim
        const fs = require("fs");
        // @ts-ignore - path module
        const pathModule = require("path");

        if (!fs.existsSync(path)) {
          throw new Error(`File not found: ${path}`);
        }

        const ext = pathModule.extname(path).toLowerCase();
        const content = fs.readFileSync(path, "utf8");

        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new Error(`Failed to parse file as JSON: ${path}`);
        }

        // Determine the codec and format to use
        let codec: Codec;
        let format: ModelFormat;

        if (ext === ".bbmodel" || parsed.meta?.model_format) {
          // Native Blockbench format
          // @ts-ignore - Codecs is globally available
          codec = Codecs.project;
          // @ts-ignore - Formats is globally available
          format = Formats[parsed.meta?.model_format] ?? Formats.free;
        } else if (ext === ".geo.json" || parsed["minecraft:geometry"] || parsed.format_version) {
          // Bedrock geometry format
          // @ts-ignore - Codecs is globally available
          codec = Codecs.bedrock;
          // @ts-ignore - Formats is globally available
          format = Formats.bedrock;
        } else if (ext === ".json" && (parsed.elements || parsed.textures)) {
          // Java block/item model format
          // @ts-ignore - Codecs is globally available
          codec = Codecs.java_block;
          // @ts-ignore - Formats is globally available
          format = Formats.java_block;
        } else if (ext === ".jem" || ext === ".jpm") {
          // OptiFine format
          // @ts-ignore - Codecs is globally available
          if (Codecs.optifine_entity) {
            codec = Codecs.optifine_entity;
            // @ts-ignore - Formats is globally available
            format = Formats.optifine_entity;
          } else {
            throw new Error("OptiFine codec is not available.");
          }
        } else {
          // Try project codec as fallback
          // @ts-ignore - Codecs is globally available
          codec = Codecs.project;
          // @ts-ignore - Formats is globally available
          format = Formats.free;
        }

        // Create a new project to avoid merging with existing data
        newProject(format);

        // Parse the content into the new project
        // @ts-ignore - parse method exists on Codec
        codec.parse(parsed, path);

        return `Opened project: ${path} (UUID: ${Project?.uuid})`;
      },
    },
    STATUS_STABLE
  );

  createTool(
    "open_projects_from_folder",
    {
      description:
        "Scans a folder for Blockbench project files and opens them all as separate tabs. Supports .bbmodel, .json, .geo.json, .mcmodel, .jem, .jpm files.",
      annotations: {
        title: "Open Projects from Folder",
        destructiveHint: true,
        openWorldHint: true,
      },
      parameters: z.object({
        folder: z.string().describe("The folder path to scan for project files."),
        recursive: z
          .boolean()
          .default(false)
          .describe("Whether to search subfolders recursively."),
        extensions: z
          .array(z.string())
          .optional()
          .describe(
            "Filter by specific file extensions (e.g., ['.bbmodel', '.geo.json']). If not provided, all supported formats are included."
          ),
      }),
      async execute({ folder, recursive, extensions }) {
        // @ts-ignore - fs is available via requireNativeModule shim
        const fs = require("fs");
        // @ts-ignore - path module
        const pathModule = require("path");

        if (!fs.existsSync(folder)) {
          throw new Error(`Folder not found: ${folder}`);
        }

        const stats = fs.statSync(folder);
        if (!stats.isDirectory()) {
          throw new Error(`Path is not a directory: ${folder}`);
        }

        const allowedExtensions = extensions ?? PROJECT_EXTENSIONS;

        // Scan for project files
        const projectFiles: string[] = [];

        function scanDirectory(dir: string) {
          const entries = fs.readdirSync(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = pathModule.join(dir, entry.name);

            if (entry.isDirectory() && recursive) {
              scanDirectory(fullPath);
            } else if (entry.isFile()) {
              const ext = pathModule.extname(entry.name).toLowerCase();
              // Handle .geo.json specially
              if (entry.name.endsWith(".geo.json") && allowedExtensions.includes(".geo.json")) {
                projectFiles.push(fullPath);
              } else if (allowedExtensions.includes(ext)) {
                projectFiles.push(fullPath);
              }
            }
          }
        }

        scanDirectory(folder);

        if (projectFiles.length === 0) {
          return `No project files found in: ${folder}`;
        }

        const results: string[] = [];
        const errors: string[] = [];

        for (const filePath of projectFiles) {
          try {
            const ext = pathModule.extname(filePath).toLowerCase();
            const content = fs.readFileSync(filePath, "utf8");

            let parsed;
            try {
              parsed = JSON.parse(content);
            } catch {
              errors.push(`Failed to parse: ${filePath}`);
              continue;
            }

            // Determine the codec and format to use
            let codec: Codec;
            let format: ModelFormat;

            if (filePath.endsWith(".bbmodel") || parsed.meta?.model_format) {
              // @ts-ignore - Codecs is globally available
              codec = Codecs.project;
              // @ts-ignore - Formats is globally available
              format = Formats[parsed.meta?.model_format] ?? Formats.free;
            } else if (
              filePath.endsWith(".geo.json") ||
              parsed["minecraft:geometry"] ||
              parsed.format_version
            ) {
              // @ts-ignore - Codecs is globally available
              codec = Codecs.bedrock;
              // @ts-ignore - Formats is globally available
              format = Formats.bedrock;
            } else if (ext === ".json" && (parsed.elements || parsed.textures)) {
              // @ts-ignore - Codecs is globally available
              codec = Codecs.java_block;
              // @ts-ignore - Formats is globally available
              format = Formats.java_block;
            } else if (ext === ".jem" || ext === ".jpm") {
              // @ts-ignore - Codecs is globally available
              if (Codecs.optifine_entity) {
                codec = Codecs.optifine_entity;
                // @ts-ignore - Formats is globally available
                format = Formats.optifine_entity;
              } else {
                errors.push(`OptiFine codec not available for: ${filePath}`);
                continue;
              }
            } else {
              // Try project codec as fallback
              // @ts-ignore - Codecs is globally available
              codec = Codecs.project;
              // @ts-ignore - Formats is globally available
              format = Formats.free;
            }

            // Create a new project to avoid merging with existing data
            newProject(format);

            // Parse the content into the new project
            // @ts-ignore - parse method exists on Codec
            codec.parse(parsed, filePath);

            results.push(pathModule.basename(filePath));
          } catch (err) {
            errors.push(`Error opening ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        let output = `Opened ${results.length} project(s) from: ${folder}\n`;
        if (results.length > 0) {
          output += `\nOpened files:\n${results.map((f) => `  - ${f}`).join("\n")}`;
        }
        if (errors.length > 0) {
          output += `\n\nErrors (${errors.length}):\n${errors.map((e) => `  - ${e}`).join("\n")}`;
        }

        return output;
      },
    },
    STATUS_STABLE
  );

  createTool(
    "list_open_projects",
    {
      description: "Lists all currently open projects/tabs in Blockbench.",
      annotations: {
        title: "List Open Projects",
        readOnlyHint: true,
      },
      parameters: z.object({}),
      async execute() {
        // @ts-ignore - ModelProject is globally available
        const projects = ModelProject.all as ModelProject[];

        if (!projects || projects.length === 0) {
          return "No projects are currently open.";
        }

        const projectList = projects.map((proj, index) => {
          const isActive = proj === Project;
          return `${index + 1}. ${isActive ? "→ " : "  "}${proj.name || "Untitled"} (UUID: ${proj.uuid}, Format: ${proj.format?.id ?? "unknown"})`;
        });

        return `# Open Projects (${projects.length})\n\n${projectList.join("\n")}`;
      },
    },
    STATUS_STABLE
  );

  createTool(
    "switch_project",
    {
      description: "Switches to a different open project by its UUID or index.",
      annotations: {
        title: "Switch Project",
      },
      parameters: z.object({
        identifier: z
          .string()
          .describe("The UUID of the project or its index (1-based) in the open projects list."),
      }),
      async execute({ identifier }) {
        // @ts-ignore - ModelProject is globally available
        const projects = ModelProject.all as ModelProject[];

        if (!projects || projects.length === 0) {
          throw new Error("No projects are currently open.");
        }

        let targetProject: ModelProject | undefined;

        // Try to parse as index first
        const index = parseInt(identifier, 10);
        if (!isNaN(index) && index >= 1 && index <= projects.length) {
          targetProject = projects[index - 1];
        } else {
          // Try to find by UUID
          targetProject = projects.find((p) => p.uuid === identifier);
        }

        if (!targetProject) {
          throw new Error(
            `Project not found: ${identifier}. Use 'list_open_projects' to see available projects.`
          );
        }

        // @ts-ignore - select method exists on ModelProject
        targetProject.select();

        return `Switched to project: ${targetProject.name || "Untitled"} (UUID: ${targetProject.uuid})`;
      },
    },
    STATUS_STABLE
  );

  createTool(
    "close_project",
    {
      description: "Closes the current project or a specific project by UUID.",
      annotations: {
        title: "Close Project",
        destructiveHint: true,
      },
      parameters: z.object({
        uuid: z
          .string()
          .optional()
          .describe("The UUID of the project to close. If not provided, closes the current project."),
        force: z
          .boolean()
          .default(false)
          .describe("Whether to close without saving (force close)."),
      }),
      async execute({ uuid, force }) {
        // @ts-ignore - ModelProject is globally available
        const projects = ModelProject.all as ModelProject[];

        if (!projects || projects.length === 0) {
          throw new Error("No projects are currently open.");
        }

        let targetProject: ModelProject | undefined;

        if (uuid) {
          targetProject = projects.find((p) => p.uuid === uuid);
          if (!targetProject) {
            throw new Error(`Project not found: ${uuid}`);
          }
        } else {
          targetProject = Project as ModelProject | undefined;
          if (!targetProject) {
            throw new Error("No active project to close.");
          }
        }

        const projectName = targetProject.name || "Untitled";
        const projectUuid = targetProject.uuid;

        // @ts-ignore - close method exists on ModelProject
        targetProject.close(force);

        return `Closed project: ${projectName} (UUID: ${projectUuid})`;
      },
    },
    STATUS_STABLE
  );
}
