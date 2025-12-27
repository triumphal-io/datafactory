import IconStar from '../assets/star.svg';
import IconDelete from '../assets/delete.svg';
import IconAdd from '../assets/add-circle.svg';
import IconExport from '../assets/export.svg';
import IconLeft from '../assets/chevron-left.svg';

export default function SheetView() {
    return (
    //  Main Sheet Container
    <div className="sheet flex flex-column">
    
        {/* Sheet Navigation Bar */}
        <div className="sheet-nav flex flex-row-center flex-space-between">
            <div className="flex flex-row-center gap-15 pad-14 padr-15 padl-15">
                <img src={IconLeft} alt="Back Icon" height="16" />
                <p>Sheet Name here</p>
            </div>
            
            <div className="flex flex-row-center">
                <div onClick="enrichSelectedCells()" className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10">
                    <img src={IconStar} alt="Star Icon" height="16" />
                    <p className="text--micro" id="enrich-text">Enrich</p>
                </div>
                
                <div onClick="deleteSelectedRows()" id="delete-row-btn" className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10" style={{display: "nonee"}}>
                    <img src={IconDelete} alt="Delete Icon" height="16" />
                    <p className="text--micro">Delete Row</p>
                </div>
                <div onClick="deleteSelectedColumns()" id="delete-column-btn" className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10" style={{display: "none"}}>
                    <img src={IconDelete} alt="Delete Icon" height="16" />
                    <p className="text--micro">Delete Column</p>
                </div>
                
                <div onClick="addRow()" className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10">
                    <img src={IconAdd} alt="Add Icon" height="16" />
                    <p className="text--micro">Add Row</p>
                </div>
                
                <div onClick="openPopup('column')" className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10">
                    <img src={IconAdd} alt="Add Icon" height="16" />
                    <p className="text--micro">Add Column</p>
                </div>
                
                <div className="sheet-nav-menu-item pad-14 pointer flex flex-row-center gap-10">
                    <img src={IconExport} alt="Export Icon" height="16" />
                    <p className="text--micro">Export</p>
                </div>
            </div>
        </div>
        
        {/* Sheet Content Area */}
        <div class="sheet-content flex-expanded scroll-x scroll-y thin-scroll">

        </div>
    </div>
    )
}