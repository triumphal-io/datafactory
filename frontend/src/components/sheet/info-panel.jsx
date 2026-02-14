import IconChevronDown from '../../assets/chevron-down.svg';
import IconDocument from '../../assets/document.svg';
import { getCellMeta, humanizeToolExecution } from '../../utils/sheet-helpers.jsx';

const SheetInfoPanel = ({ row, col, sheetData, expandedToolSteps, setExpandedToolSteps }) => {
    const cellData = sheetData.rows[row]?.[col];
    const cellMeta = getCellMeta(cellData);

    if (cellMeta && cellMeta.process && cellMeta.process.length > 0) {
        const filteredTools = cellMeta.process.filter(tool =>
            tool.tool !== 'tool_get_workbook_structure'
        );

        return (
            <>
                <p style={{ margin: '0 0 12px 0', fontWeight: '600', color: '#e0e0e0' }}>Process</p>

                <div style={{ position: 'relative', paddingLeft: '8px' }}>
                    {/* Continuous vertical line for entire timeline */}
                    <div style={{
                        position: 'absolute',
                        left: '3.5px',
                        top: '10px',
                        bottom: '10px',
                        width: '1px',
                        backgroundColor: '#5b5b5b'
                    }} />

                    {filteredTools.map((tool, idx) => {
                        const { mainText, summary } = humanizeToolExecution(tool);
                        const isExpanded = expandedToolSteps.has(idx);

                        return (
                            <div key={idx} style={{
                                position: 'relative',
                                marginBottom: idx === filteredTools.length - 1 ? '0' : '16px',
                                paddingLeft: '7.5px'
                            }}>
                                {/* Timeline dot */}
                                <div style={{
                                    position: 'absolute',
                                    left: '-7.5px',
                                    top: '4px',
                                    width: '6px',
                                    height: '6px',
                                    backgroundColor: '#5b5b5b',
                                    boxSizing: 'border-box'
                                }} />

                                {/* Main tool description with expand/collapse functionality */}
                                <div
                                    onClick={() => {
                                        if (summary) {
                                            setExpandedToolSteps(prev => {
                                                const newSet = new Set(prev);
                                                if (isExpanded) {
                                                    newSet.delete(idx);
                                                } else {
                                                    newSet.add(idx);
                                                }
                                                return newSet;
                                            });
                                        }
                                    }}
                                    style={{
                                        cursor: summary ? 'pointer' : 'default',
                                        display: 'flex',
                                        alignItems: 'start',
                                        gap: '6px'
                                    }}
                                >
                                    <p style={{
                                        margin: '0',
                                        color: '#d0d0d0',
                                        lineHeight: '1.6',
                                        fontSize: '10px',
                                        wordBreak: 'break-word',
                                        flex: 1
                                    }}>
                                        {mainText}
                                    </p>
                                    {summary && (
                                        <img
                                            src={IconChevronDown}
                                            alt="Toggle"
                                            height="10"
                                            style={{
                                                marginTop: '2px',
                                                opacity: 0.6,
                                                transition: 'transform 0.2s',
                                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                                            }}
                                        />
                                    )}
                                </div>

                                {/* Collapsible summary section */}
                                {summary && isExpanded && (
                                    <div style={{
                                        paddingTop: '6px',
                                        fontSize: '10px',
                                        color: '#b8b8b8',
                                        fontStyle: 'italic',
                                        lineHeight: '1.5',
                                    }}>
                                        {summary}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {cellMeta.sources?.files && cellMeta.sources.files.length > 0 && (
                    <div style={{ marginTop: '5px', paddingTop: '12px' }}>
                        <p className='text--nano opacity-5 mrgnb-5'>Source Files:</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                            {cellMeta.sources.files.map((file, idx) => (
                                <div
                                    key={idx}
                                    title={file}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 8px',
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        color: '#e0e0e0',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        maxWidth: '200px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <img
                                        src={IconDocument}
                                        alt=""
                                        style={{
                                            width: '14px',
                                            height: '14px',
                                            flexShrink: 0,
                                            opacity: 0.7
                                        }}
                                    />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{file}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {cellMeta.sources?.links && cellMeta.sources.links.length > 0 && (
                    <div style={{ marginTop: '5px', paddingTop: '12px' }}>
                        <p className='text--nano opacity-7 mrgnb-5'>Source Links:</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                            {cellMeta.sources.links.map((link, idx) => {
                                let faviconUrl = '';
                                let domain = '';
                                try {
                                    const url = new URL(link);
                                    domain = url.hostname.replace('www.', '');
                                    faviconUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=16`;
                                } catch {
                                    // Invalid URL, no favicon
                                }

                                return (
                                    <a
                                        key={idx}
                                        href={link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={link}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '4px 8px',
                                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                            borderRadius: '4px',
                                            textDecoration: 'none',
                                            color: '#e0e0e0',
                                            transition: 'background-color 0.2s',
                                            fontSize: '10px',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            maxWidth: '250px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                                    >
                                        {faviconUrl && (
                                            <img
                                                src={faviconUrl}
                                                alt=""
                                                style={{
                                                    width: '14px',
                                                    height: '14px',
                                                    flexShrink: 0,
                                                    borderRadius: '2px'
                                                }}
                                                onError={(e) => e.target.style.display = 'none'}
                                            />
                                        )}
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{domain || link}</span>
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                )}
            </>
        );
    }

    return (
        <>
            <p style={{ margin: '0 0 8px 0', fontWeight: '600', color: '#e0e0e0' }}>Information</p>
            <p style={{ margin: 0 }}>
                No enrichment process information available for this cell.
            </p>
        </>
    );
};

export default SheetInfoPanel;
