import IconStar from '../../assets/logo-icon.svg';
import IconDelete from '../../assets/delete.svg';
import IconAdd from '../../assets/add-circle.svg';
import IconExport from '../../assets/export.svg';
import IconCheck from '../../assets/checkmark.svg';
import IconDismiss from '../../assets/dismiss.svg';

/**
 * Toolbar for sheet operations: accept/reject AI changes, enrich cells, add/delete rows and columns, export.
 *
 * @param {Object} props
 * @param {Set} props.pendingAiChanges - Set of cell keys with pending AI changes
 * @param {function} props.onAcceptAiChanges - Accept all pending AI changes
 * @param {function} props.onRejectAiChanges - Reject all pending AI changes
 * @param {function} props.onEnrichCells - Trigger bulk enrichment on selected cells
 * @param {string} props.enrichText - Label text for the enrich button
 * @param {boolean} props.showDeleteRow - Whether to show the delete row option
 * @param {boolean} props.showDeleteColumn - Whether to show the delete column option
 * @param {function} props.onDeleteRows - Delete selected rows
 * @param {function} props.onDeleteColumns - Delete selected columns
 * @param {function} props.onAddRow - Add a new row
 * @param {function} props.onAddColumn - Add a new column
 * @param {function} props.onExport - Export sheet data (e.g., as XLSX)
 * @param {boolean} props.hasColumns - Whether the sheet has any columns
 */
const SheetToolbar = ({
    pendingAiChanges,
    onAcceptAiChanges,
    onRejectAiChanges,
    onEnrichCells,
    enrichText,
    showDeleteRow,
    showDeleteColumn,
    onDeleteRows,
    onDeleteColumns,
    onAddRow,
    onAddColumn,
    onExport,
    hasColumns,
}) => {
    return (
        <div className="flex flex-row-center">
            {pendingAiChanges.size > 0 ? (
                <>
                    <div
                        onClick={onAcceptAiChanges}
                        className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                        style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)' }}
                    >
                        <img src={IconCheck} alt="Check Icon" height="16" />
                        <p className="text--micro">Accept Changes</p>
                    </div>
                    <div
                        onClick={onRejectAiChanges}
                        className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                        style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)' }}
                    >
                        <img src={IconDismiss} alt="Dismiss Icon" height="16" />
                        <p className="text--micro">Reject Changes</p>
                    </div>
                </>
            ) : (
                <div
                    onClick={onEnrichCells}
                    className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                >
                    <img src={IconStar} alt="Star Icon" height="16" />
                    <p className="text--micro">{enrichText}</p>
                </div>
            )}

            {showDeleteRow && (
                <div
                    onClick={onDeleteRows}
                    className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                >
                    <img src={IconDelete} alt="Delete Icon" height="16" />
                    <p className="text--micro">Delete Row</p>
                </div>
            )}

            {showDeleteColumn && (
                <div
                    onClick={onDeleteColumns}
                    className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                >
                    <img src={IconDelete} alt="Delete Icon" height="16" />
                    <p className="text--micro">Delete Column</p>
                </div>
            )}

            {hasColumns && (
                <div
                    onClick={onAddRow}
                    className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
                >
                    <img src={IconAdd} alt="Add Icon" height="16" />
                    <p className="text--micro">Add Row</p>
                </div>
            )}

            <div
                onClick={onAddColumn}
                className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
            >
                <img src={IconAdd} alt="Add Icon" height="16" />
                <p className="text--micro">Add Column</p>
            </div>

            <div
                onClick={onExport}
                className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10"
            >
                <img src={IconExport} alt="Export Icon" height="16" />
                <p className="text--micro">Export</p>
            </div>
        </div>
    );
};

export default SheetToolbar;
