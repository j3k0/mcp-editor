# mcp-editor
This is a direct port of [Anthropic's filesystem editing tools](https://github.com/anthropics/anthropic-quickstarts/blob/main/computer-use-demo/computer_use_demo/tools/edit.py) from their computer use demos to a TypeScript MCP server. It was written largely by Claude Sonnet 3.5 on Roo Cline (now Roo Code) with probably not quite enough direct supervision. I checked over the code and use this server every day, but there may be mistakes or AI weirdness.

I recommend using this server along with [mcp-server-commands](https://github.com/g0t4/mcp-server-commands)

<a href="https://glama.ai/mcp/servers/lnfcd9is5i"><img width="380" height="200" src="https://glama.ai/mcp/servers/lnfcd9is5i/badge" alt="mcp-editor MCP server" /></a>

### ***WARNING: This MCP server has NO access controls and relies entirely on your client's approval mechanisms. Use at your own risk. DO NOT automatically approve write operations, doing so basically gives the LLM permission to destroy your computer.***
### ***WARNING: This MCP server is NOT actively maintained, and is provided for reference (for example creating your own MCP server with proper access controls). I may update it occasionally.***

## Usage
Get the files on your computer.
Run:
```
npm install
npm build
```

If you're using the Claude desktop app, paste this into your config under "mcpServers", and edit the path to match where you put mcp-editor:
```json
{
  "mcpServers":
... your existing servers ...
    "mcp-editor": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-editor/dist/server.js"]
    }
  }
}
```

If you're using [MCP Installer](https://github.com/anaisbetts/mcp-installer), you just need to provide your LLM with the path on your disk to mcp-editor.
