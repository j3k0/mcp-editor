import * as path from 'path';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
    FileHistory,
    ToolError,
    ViewArgs,
    CreateArgs,
    StringReplaceArgs,
    InsertArgs,
    UndoEditArgs
} from './types.js';
import {
    SNIPPET_LINES,
    readFile,
    writeFile,
    makeOutput,
    validatePath,
    truncateText
} from './utils.js';

const execAsync = promisify(exec);

export class FileEditor {
    private fileHistory: FileHistory = {};

    async view(args: ViewArgs): Promise<string> {
        await validatePath('view', args.path);

        if (await this.isDirectory(args.path)) {
            if (args.view_range) {
                throw new ToolError(
                    'The `view_range` parameter is not allowed when `path` points to a directory.'
                );
            }

            const { stdout, stderr } = await execAsync(
                `find "${args.path}" -maxdepth 2 -not -path '*/\\.*'`
            );

            if (stderr) throw new ToolError(stderr);

            return `Here's the files and directories up to 2 levels deep in ${args.path}, excluding hidden items:\n${stdout}\n`;
        }

        const fileContent = await readFile(args.path);
        let initLine = 1;

        if (args.view_range) {
            const fileLines = fileContent.split('\n');
            const nLinesFile = fileLines.length;
            const [start, end] = args.view_range;

            if (start < 1 || start > nLinesFile) {
                throw new ToolError(
                    `Invalid \`view_range\`: ${args.view_range}. Its first element \`${start}\` should be within the range of lines of the file: [1, ${nLinesFile}]`
                );
            }

            if (end !== -1) {
                if (end > nLinesFile) {
                    throw new ToolError(
                        `Invalid \`view_range\`: ${args.view_range}. Its second element \`${end}\` should be smaller than the number of lines in the file: \`${nLinesFile}\``
                    );
                }
                if (end < start) {
                    throw new ToolError(
                        `Invalid \`view_range\`: ${args.view_range}. Its second element \`${end}\` should be larger or equal than its first \`${start}\``
                    );
                }
            }

            const selectedLines = end === -1
                ? fileLines.slice(start - 1)
                : fileLines.slice(start - 1, end);

            return makeOutput(selectedLines.join('\n'), String(args.path), start);
        }

        return makeOutput(fileContent, String(args.path));
    }

    async create(args: CreateArgs): Promise<string> {
        await validatePath('create', args.path);
        await writeFile(args.path, args.file_text);

        if (!this.fileHistory[args.path]) {
            this.fileHistory[args.path] = [];
        }
        this.fileHistory[args.path].push(args.file_text);

        return `File created successfully at: ${args.path}`;
    }

    async strReplace(args: StringReplaceArgs): Promise<string> {
        await validatePath('string_replace', args.path);

        const fileContent = await readFile(args.path);
        const oldStr = args.old_str.replace(/\t/g, '    ');
        const newStr = args.new_str?.replace(/\t/g, '    ') ?? '';
        const replaceAll = args.replace_all ?? false; // Default to false if not provided

        const regex = new RegExp(oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), replaceAll ? 'g' : '');
        const occurrences = (fileContent.match(regex) || []).length;

        if (occurrences === 0) {
            throw new ToolError(
                `No replacement was performed, old_str \`${args.old_str}\` did not appear verbatim in ${args.path}.`
            );
        }

        if (!replaceAll && occurrences > 1) {
            const lines = fileContent.split('\n')
                .map((line, idx) => line.includes(oldStr) ? idx + 1 : null)
                .filter((idx): idx is number => idx !== null);

            throw new ToolError(
                `No replacement was performed. Multiple occurrences of old_str \`${args.old_str}\` in lines ${lines}. Add more context, by include lines around the string to replace in old_str and new_str to ensure old_str is unique within the file, or set replace_all=true.` // Updated error message
            );
        }

        const newContent = fileContent.replace(regex, newStr);
        await writeFile(args.path, newContent);

        if (!this.fileHistory[args.path]) {
            this.fileHistory[args.path] = [];
        }
        this.fileHistory[args.path].push(fileContent);

        // Snippet generation might need adjustment for multiple replacements, but let's keep it simple for now.
        // It will show the area around the *first* replacement.
        const firstOccurrenceIndex = fileContent.search(regex);
        const replacementLine = fileContent.substring(0, firstOccurrenceIndex).split('\n').length;
        const startLine = Math.max(0, replacementLine - SNIPPET_LINES);
        const endLine = replacementLine + SNIPPET_LINES + newStr.split('\n').length; // Approximate end line
        const snippet = newContent.split('\n').slice(startLine, endLine + 1).join('\n');

        let successMsg = `The file ${args.path} has been edited (${occurrences} replacement${occurrences > 1 ? 's' : ''} made). `;
        successMsg += makeOutput(snippet, `a snippet of ${args.path}`, startLine + 1);
        successMsg += 'Review the changes and make sure they are as expected. Edit the file again if necessary.';

        return successMsg;
    }

    async insert(args: InsertArgs): Promise<string> {
        await validatePath('insert', args.path);

        const fileContent = await readFile(args.path);
        const newStr = args.new_str.replace(/\t/g, '    ');
        const fileLines = fileContent.split('\n');
        const nLinesFile = fileLines.length;

        if (args.insert_line < 0 || args.insert_line > nLinesFile) {
            throw new ToolError(
                `Invalid \`insert_line\` parameter: ${args.insert_line}. It should be within the range of lines of the file: [0, ${nLinesFile}]`
            );
        }

        const newStrLines = newStr.split('\n');
        const newFileLines = [
            ...fileLines.slice(0, args.insert_line),
            ...newStrLines,
            ...fileLines.slice(args.insert_line)
        ];

        const snippetLines = [
            ...fileLines.slice(Math.max(0, args.insert_line - SNIPPET_LINES), args.insert_line),
            ...newStrLines,
            ...fileLines.slice(args.insert_line, args.insert_line + SNIPPET_LINES)
        ];

        const newFileContent = newFileLines.join('\n');
        const snippet = snippetLines.join('\n');

        await writeFile(args.path, newFileContent);

        if (!this.fileHistory[args.path]) {
            this.fileHistory[args.path] = [];
        }
        this.fileHistory[args.path].push(fileContent);

        let successMsg = `The file ${args.path} has been edited. `;
        successMsg += makeOutput(
            snippet,
            'a snippet of the edited file',
            Math.max(1, args.insert_line - SNIPPET_LINES + 1)
        );
        successMsg += 'Review the changes and make sure they are as expected (correct indentation, no duplicate lines, etc). Edit the file again if necessary.';

        return successMsg;
    }

    async undoEdit(args: UndoEditArgs): Promise<string> {
        await validatePath('undo_edit', args.path);

        if (!this.fileHistory[args.path] || this.fileHistory[args.path].length === 0) {
            throw new ToolError(`No edit history found for ${args.path}.`);
        }

        const oldText = this.fileHistory[args.path].pop()!;
        await writeFile(args.path, oldText);

        return `Last edit to ${args.path} undone successfully. ${makeOutput(oldText, String(args.path))}`;
    }

    private async isDirectory(filePath: string): Promise<boolean> {
        try {
            const stats = await fs.stat(filePath);
            return stats.isDirectory();
        } catch (error) {
            return false;
        }
    }
}