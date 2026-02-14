import IconText from '../assets/text.svg';
import IconNumber from '../assets/number.svg';
import IconSelect from '../assets/select.svg';
import IconMultiselect from '../assets/multiselect.svg';
import IconMail from '../assets/mail.svg';
import IconCheckbox from '../assets/checkbox.svg';
import IconUrl from '../assets/url.svg';
import IconFile from '../assets/file.svg';

// Helper function to get icon based on column type
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

// Helper function to convert column index to Excel-style letter (A, B, C, ..., Z, AA, AB, ...)
export const getColumnLetter = (index) => {
    let letter = '';
    let num = index;
    while (num >= 0) {
        letter = String.fromCharCode(65 + (num % 26)) + letter;
        num = Math.floor(num / 26) - 1;
    }
    return letter;
};

// Helper function to extract display value from cell (handles both simple values and metadata objects)
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

// Helper function to get cell metadata
export const getCellMeta = (cellData) => {
    if (typeof cellData === 'object' && cellData.meta !== undefined) {
        return cellData.meta;
    }
    return null;
};

// Helper function to create cell value with metadata
export const createCellWithMeta = (value, meta = null) => {
    return { value, meta };
};

// Helper function to humanize tool execution display
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
