import IconText from '../assets/text.svg';
import IconNumber from '../assets/number.svg';
import IconSelect from '../assets/select.svg';
import IconMultiselect from '../assets/multiselect.svg';
import IconMail from '../assets/mail.svg';
import IconCheckbox from '../assets/checkbox.svg';
import IconUrl from '../assets/url.svg';
import IconFile from '../assets/file.svg';

/**
 * Returns the SVG icon path for a given column type.
 * @param {string} type - Column type: 'text' | 'number' | 'checkbox' | 'select' | 'multiselect' | 'url' | 'email' | 'file'
 * @returns {string} SVG icon import path
 */
export const getColumnTypeIcon = (type) => {
    switch (type) {
        case 'text':
            return IconText;
        case 'number':
            return IconNumber;
        case 'checkbox':
            return IconCheckbox;
        case 'select':
            return IconSelect;
        case 'multiselect':
            return IconMultiselect;
        case 'url':
            return IconUrl;
        case 'email':
            return IconMail;
        case 'file':
            return IconFile;
        default:
            return IconText;
    }
};

/**
 * Converts a zero-based column index to an Excel-style letter (0→A, 25→Z, 26→AA, etc.).
 * @param {number} index - Zero-based column index
 * @returns {string} Excel-style column letter
 */
export const getColumnLetter = (index) => {
    let letter = '';
    let num = index;
    while (num >= 0) {
        letter = String.fromCharCode(65 + (num % 26)) + letter;
        num = Math.floor(num / 26) - 1;
    }
    return letter;
};

/**
 * Extracts the display value from a cell. Handles both simple values and metadata objects ({value, meta}).
 * @param {*} cellData - Raw cell data (string, number, or {value, meta} object)
 * @returns {*} The display value, or empty string if null/undefined
 */
export const getCellValue = (cellData) => {
    if (cellData === null || cellData === undefined) {
        return '';
    }
    // If cell has metadata structure, extract the value
    if (typeof cellData === 'object' && cellData.value !== undefined) {
        return cellData.value;
    }
    // Otherwise return as-is (string, number, etc.)
    return cellData;
};

/**
 * Extracts metadata from a cell data object.
 * @param {*} cellData - Raw cell data (may be a {value, meta} object)
 * @returns {Object|null} The cell metadata object, or null if none exists
 */
export const getCellMeta = (cellData) => {
    if (typeof cellData === 'object' && cellData.meta !== undefined) {
        return cellData.meta;
    }
    return null;
};

/**
 * Creates a cell data object with value and optional metadata.
 * @param {*} value - The cell display value
 * @param {Object|null} [meta=null] - Optional metadata (e.g., process history, sources)
 * @returns {{ value: *, meta: Object|null }} Cell data object
 */
export const createCellWithMeta = (value, meta = null) => {
    return { value, meta };
};

/**
 * Converts a raw tool execution record into human-readable display text.
 * @param {Object} tool - Tool execution record
 * @param {string} tool.tool - Tool name (e.g., 'tool_search', 'tool_web_scraper')
 * @param {Object} tool.args - Arguments passed to the tool
 * @param {string} tool.summary - Raw summary/result from the tool execution
 * @returns {{ mainText: string|JSX.Element, summary: string|JSX.Element }} Display-ready text and summary
 */
export const humanizeToolExecution = (tool) => {
    const { tool: toolName, args, summary } = tool;

    let mainText = '';
    let summaryText = summary;
    switch (toolName) {
        case 'tool_search':
            mainText = `Searched for "${args.keyword || ''}"`;
            // Parse JSON results and display as chips
            let searchResults = [];
            try {
                searchResults = JSON.parse(summary);
            } catch (e) {
                // Fallback to old counting method if parsing fails
                const results = (summary.match(/href/g) || []).length;
                summaryText = `Found ${results || 0} results`;
                break;
            }

            if (searchResults && searchResults.length > 0) {
                summaryText = (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {searchResults.map((result, idx) => {
                            // Extract domain for favicon
                            let faviconUrl = '';
                            let domain = '';
                            try {
                                const url = new URL(result.href);
                                domain = url.hostname.replace('www.', '');
                                faviconUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=16`;
                            } catch (e) {
                                // Invalid URL, no favicon
                            }

                            return (
                                <a
                                    key={idx}
                                    href={result.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={result.body || result.title || result.href}
                                    style={{
                                        display: 'flex',
                                        gap: '8px',
                                        padding: '4px 6px',
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        borderRadius: '4px',
                                        textDecoration: 'none',
                                        color: '#e0e0e0',
                                        transition: 'background-color 0.2s',
                                        fontSize: '10px',
                                        border: '1px solid rgba(255, 255, 255, 0.1)'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                                >
                                    {faviconUrl && (
                                        <img
                                            src={faviconUrl}
                                            alt=""
                                            style={{
                                                width: '16px',
                                                height: '16px',
                                                flexShrink: 0,
                                                marginTop: '2px',
                                                borderRadius: '2px'
                                            }}
                                            onError={(e) => e.target.style.display = 'none'}
                                        />
                                    )}
                                    <div>
                                        <div style={{
                                            fontSize: '10px',
                                            color: '#e0e0e0',
                                            marginBottom: '2px',
                                        }}>
                                            {result.title}
                                        </div>
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                );
            } else {
                summaryText = 'No results found';
            }
            break;

        case 'tool_web_scraper':
            mainText = `Read ${args.url || ''}`;
            break;

        case 'tool_query_file_data':
            if (args.search_type === 'identifier') {
                mainText = `Searched for ID "${args.query || ''}" in ${args.filename || ''}`;
            } else {
                mainText = `Queried "${args.query || ''}" in ${args.filename || ''}`;
            }
            break;

        case 'tool_get_sheet_data':
            mainText = `Retrieved data from sheet ${args.sheet_identifier || ''}`;
            break;

        case 'tool_read_file':
            mainText = `Read file ${args.file_id || ''}`;
            break;

        default:
            // For unrecognized tools, show tool name and args as JSON
            mainText = (
                <>
                    <span style={{ fontWeight: '600', color: '#e0e0e0' }}>{toolName}</span>
                    {args && Object.keys(args).length > 0 && (
                        <>
                            <br />
                            <span style={{ opacity: 0.8 }}>
                                {JSON.stringify(args, null, 2)}
                            </span>
                        </>
                    )}
                </>
            );
    }

    return { mainText, summary: summaryText || '' };
};
