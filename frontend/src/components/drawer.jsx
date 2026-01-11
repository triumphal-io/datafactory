import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import IconPanClose from '../assets/pan-close.svg';
import IconLogo from '../assets/logo-icon.svg';
import IconNew from '../assets/add.svg';
import IconSettings from '../assets/settings.svg';
import IconLogout from '../assets/sign-out.svg';
import LoaderGif from '../assets/loader.gif';
import { apiFetch } from '../utils/api';

export default function Drawer({ isOpen, onClose }) {
    const navigate = useNavigate();
    const [opacity, setOpacity] = useState(isOpen ? 1 : 0);
    const [transition, setTransition] = useState(isOpen ? 'opacity 0.2s ease' : 'none');
    const [workbooks, setWorkbooks] = useState([]);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => setOpacity(1), 200);
            setTransition('opacity 0.2s ease');
        } else {
            setOpacity(0);
            setTransition('none');
        }
    }, [isOpen]);

    useEffect(() => {
        const fetchWorkbooks = async () => {
            try {
                const response = await apiFetch('/api/workbooks/list');
                if (response.ok) {
                    const data = await response.json();
                    console.log('Fetched workbooks:', data);
                    setWorkbooks(data.workbooks);
                }
            } catch (error) {
                console.error('Error fetching workbooks:', error);
            }
        };

        if (isOpen) {
            fetchWorkbooks();
        }
    }, [isOpen]);

    const handleNewWorkbook = async (e) => {
        e.preventDefault();
        if (isCreating) return; // Prevent double clicks
        
        setIsCreating(true);
        try {
            const response = await apiFetch('/api/workbooks/create', {
                method: 'POST'
            });
            if (response.ok) {
                const data = await response.json();
                console.log('Created New Workbook:', data);
                // Navigate to the newly created workbook
                navigate(`/workbook/${data.workbook_id}/sheet/${data.sheet_id}`);
                onClose();
            } else {
                console.error('Failed to create workbook');
            }
        } catch (error) {
            console.error('Error creating workbook:', error);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className='flex flex-column' style={{
            width: isOpen ? '260px' : '0',
            height: '100vh',
            background: '#222',
            transition: 'width 0.3s ease',
            overflow: 'hidden',
            borderRight: isOpen ? '2.5px solid #2B2B2B' : 'none'
        }}>
        <div style={{ display: 'flex', padding: '15px', justifyContent: 'space-between', alignItems: 'center' }}>
            <img src={IconLogo} alt="Logo" height="20" />
            <img src={IconPanClose} alt="Close Drawer" height="20" style={{ cursor: 'pointer' }} onClick={onClose} />
        </div>
        
        <div className='flex flex-column hght-100' style={{ opacity, transition }}>
        <div className='flex flex-column gap-10 mrgnt-15'>
            <div 
                onClick={handleNewWorkbook} 
                style={{ 
                    textDecoration: 'none', 
                    color: 'inherit', 
                    cursor: isCreating ? 'not-allowed' : 'pointer',
                    opacity: isCreating ? 0.6 : 1
                }} 
                className='drawer-item flex flex-row-center gap-12'
            >
                <img 
                    src={isCreating ? LoaderGif : IconNew} 
                    alt={isCreating ? "Loading" : "New Workbook"} 
                    height="16" 
                />
                <p className='text--micro text__medium'>
                    {isCreating ? 'Creating...' : 'New Workbook'}
                </p>
            </div>
        </div>
        <div style={{ color: '#ccc' }}>
            <p className='text--micro text__semibold opacity-5 mrgnt-15' style={{ padding: "0 15px" }}>History</p>
            <ul className='mrgnt-10 text--micro workbook-history'>
                {workbooks.length > 0 ? (
                    [...workbooks].reverse().map((workbook) => (
                        <Link
                            key={workbook.id}
                            to={`/workbook/${workbook.id}/sheet/default-sheet`}
                            style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                            <li>{workbook.name || workbook.title}</li>
                        </Link>
                    ))
                ) : (
                    <li style={{ opacity: 0.5, paddingLeft: '15px' }}>No workbooks yet</li>
                )}
            </ul>
        </div>
        <div className='spacer'></div>
        <div className='flex flex-column gap-5 mrgnt-15 mrgnb-10'>
            <Link to="/settings" style={{ textDecoration: 'none', color: 'inherit' }} className='drawer-item flex flex-row-center gap-12'>
                <img src={IconSettings} alt="New Workbook" height="16" />
                <p className='text--micro text__medium'>Settings</p>
            </Link>
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}  className='drawer-item flex flex-row-center gap-12'>
                <img src={IconLogout} alt="New Workbook" height="16" />
                <p className='text--micro text__medium'>Logout</p>
            </Link>
        </div>
        </div>
    </div>
    );
}
