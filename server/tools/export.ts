/// <reference types="three" />
/// <reference types="blockbench-types" />
import { z } from "zod";
import { createTool } from "@/lib/factories";
import { STATUS_STABLE } from "@/lib/constants";

export function registerExportTools() {
  createTool(
    "to_geo_json",
    {
      description:
        "Converts the current model to Minecraft Bedrock geometry JSON format (.geo.json) and returns the JSON string. The model must be in a Bedrock-compatible format.",
      annotations: {
        title: "Convert to GeoJSON",
        readOnlyHint: true,
      },
      parameters: z.object({
        pretty: z
          .boolean()
          .default(true)
          .describe("Whether to format the JSON with indentation for readability."),
      }),
      async execute({ pretty }) {
        if (!Project) {
          throw new Error("No project is currently open. Create or open a project first.");
        }

        // Check if the current format supports Bedrock export
        // @ts-ignore - Codecs is globally available in Blockbench
        const bedrockCodec = Codecs.bedrock;
        if (!bedrockCodec) {
          throw new Error("Bedrock codec is not available.");
        }

        // Check if the format is compatible
        // @ts-ignore - Format is globally available
        if (!Format.codec || (Format.codec !== bedrockCodec && Format.id !== "bedrock" && Format.id !== "bedrock_block")) {
          // Try to use the bedrock codec anyway, but warn that results may vary
        }

        // Compile the model to Bedrock geometry format
        // @ts-ignore - compile method exists on Codec
        const geoJson = bedrockCodec.compile();

        if (!geoJson) {
          throw new Error("Failed to compile model to geometry JSON format.");
        }

        // compile() returns a string, parse and re-stringify for pretty printing if needed
        if (typeof geoJson === "string") {
          if (pretty) {
            return JSON.stringify(JSON.parse(geoJson), null, 2);
          }
          return geoJson;
        }

        // If it's an object, stringify it
        return pretty ? JSON.stringify(geoJson, null, 2) : JSON.stringify(geoJson);
      },
    },
    STATUS_STABLE
  );

  createTool(
    "export_geo_json",
    {
      description:
        "Exports the current model to a Minecraft Bedrock geometry JSON file (.geo.json) at the specified path. The model must be in a Bedrock-compatible format.",
      annotations: {
        title: "Export GeoJSON File",
        openWorldHint: true,
      },
      parameters: z.object({
        path: z
          .string()
          .describe(
            "The file path where the .geo.json file should be saved. Should end with .geo.json extension."
          ),
        pretty: z
          .boolean()
          .default(true)
          .describe("Whether to format the JSON with indentation for readability."),
      }),
      async execute({ path, pretty }) {
        if (!Project) {
          throw new Error("No project is currently open. Create or open a project first.");
        }

        // @ts-ignore - Codecs is globally available in Blockbench
        const bedrockCodec = Codecs.bedrock;
        if (!bedrockCodec) {
          throw new Error("Bedrock codec is not available.");
        }

        // Compile the model to Bedrock geometry format
        // @ts-ignore - compile method exists on Codec
        const geoJson = bedrockCodec.compile();

        if (!geoJson) {
          throw new Error("Failed to compile model to geometry JSON format.");
        }

        // Handle both string and object return types from compile()
        let jsonString: string;
        if (typeof geoJson === "string") {
          jsonString = pretty ? JSON.stringify(JSON.parse(geoJson), null, 2) : geoJson;
        } else {
          jsonString = pretty ? JSON.stringify(geoJson, null, 2) : JSON.stringify(geoJson);
        }

        // Ensure path ends with .geo.json
        const filePath = path.endsWith(".geo.json")
          ? path
          : path.endsWith(".json")
          ? path.replace(".json", ".geo.json")
          : `${path}.geo.json`;

        // Write the file using Blockbench's fs module
        // @ts-ignore - fs is available via requireNativeModule shim
        const fs = require("fs");
        // @ts-ignore - path module
        const pathModule = require("path");

        // Ensure directory exists
        const dir = pathModule.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write the file
        fs.writeFileSync(filePath, jsonString, "utf8");

        return `Successfully exported model to: ${filePath}`;
      },
    },
    STATUS_STABLE
  );

  createTool(
    "convert_format",
    {
      description:
        "Converts the current project to a different Blockbench format. This is useful for converting between Java, Bedrock, and other model formats before exporting. Use 'list_formats' tool to see all available formats.",
      annotations: {
        title: "Convert Format",
        destructiveHint: true,
      },
      parameters: z.object({
        format: z
          .string().default("bedrock")
          .describe("The target format ID to convert to. Use 'list_formats' tool to see all available format IDs."),
      }),
      async execute({ format }) {
        if (!Project) {
          throw new Error("No project is currently open. Create or open a project first.");
        }

        // @ts-ignore - Formats is globally available in Blockbench
        const targetFormat = Formats[format];
        if (!targetFormat) {
          // @ts-ignore - Formats is globally available in Blockbench
          const availableFormats = Object.keys(Formats).join(", ");
          throw new Error(`Format "${format}" is not available. Available formats: ${availableFormats}`);
        }

        const previousFormat = Format?.id ?? "unknown";

        // Convert the project to the new format
        // @ts-ignore - convertTo method exists on ModelFormat
        targetFormat.convertTo();

        return `Successfully converted project from "${previousFormat}" to "${format}" format.`;
      },
    },
    STATUS_STABLE
  );

  createTool(
    "list_formats",
    {
      description:
        "Lists all available Blockbench formats that can be used for creating or converting projects. Returns format IDs, names, descriptions, and capabilities.",
      annotations: {
        title: "List Formats",
        readOnlyHint: true,
      },
      parameters: z.object({}),
      async execute() {
        // @ts-ignore - Formats is globally available in Blockbench
        const formats = Formats as Record<string, ModelFormat>;

        interface FormatInfo {
          id: string;
          name: string;
          description: string;
          category: string;
          target: string | string[];
          canConvertTo: boolean;
        }

        const formatList: FormatInfo[] = [];

        for (const [id, format] of Object.entries(formats)) {
          if (!format || typeof format !== "object") continue;

          formatList.push({
            id,
            name: format.name ?? id,
            description: format.description ?? "",
            category: format.category ?? "unknown",
            target: format.target ?? [],
            canConvertTo: format.can_convert_to !== false,
          });
        }

        // Sort by category then name
        formatList.sort((a, b) => {
          if (a.category !== b.category) {
            return a.category.localeCompare(b.category);
          }
          return a.name.localeCompare(b.name);
        });

        // Format the output
        const output = formatList.map((f) => {
          const targetStr = Array.isArray(f.target) ? f.target.join(", ") : f.target;
          return `- **${f.name}** (id: \`${f.id}\`)
  Category: ${f.category}
  Target: ${targetStr || "N/A"}
  ${f.description ? `Description: ${f.description}` : ""}
  Can convert to: ${f.canConvertTo ? "Yes" : "No"}`;
        });

        return `# Available Blockbench Formats\n\n${output.join("\n\n")}`;
      },
    },
    STATUS_STABLE
  );

  createTool(
    "get_current_format",
    {
      description:
        "Gets information about the current project's format, including its ID, name, and capabilities.",
      annotations: {
        title: "Get Current Format",
        readOnlyHint: true,
      },
      parameters: z.object({}),
      async execute() {
        if (!Project) {
          throw new Error("No project is currently open. Create or open a project first.");
        }

        // @ts-ignore - Format is globally available in Blockbench
        const format = Format as ModelFormat;
        if (!format) {
          throw new Error("No format is set for the current project.");
        }

        const info = {
          id: format.id,
          name: format.name,
          description: format.description ?? "",
          category: format.category ?? "unknown",
          target: format.target ?? [],
          // Format capabilities
          box_uv: format.box_uv ?? false,
          optional_box_uv: format.optional_box_uv ?? false,
          single_texture: format.single_texture ?? false,
          bone_rig: format.bone_rig ?? false,
          rotate_cubes: format.rotate_cubes ?? false,
          integer_size: format.integer_size ?? false,
          locators: format.locators ?? false,
          animation_mode: format.animation_mode ?? false,
          meshes: format.meshes ?? false,
        };

        return JSON.stringify(info, null, 2);
      },
    },
    STATUS_STABLE
  );
}
