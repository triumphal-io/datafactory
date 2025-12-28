import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import IconPanClose from '../assets/pan-close.svg';
import IconLogo from '../assets/logo-icon.svg';
import IconNew from '../assets/add.svg';
import IconSettings from '../assets/settings.svg';
import IconLogout from '../assets/sign-out.svg';
import { apiFetch } from '../utils/api';

export default function Drawer({ isOpen, onClose }) {
    const [opacity, setOpacity] = useState(isOpen ? 1 : 0);
    const [transition, setTransition] = useState(isOpen ? 'opacity 0.2s ease' : 'none');
    const [documents, setDocuments] = useState([]);

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
        const fetchDocuments = async () => {
            try {
                const response = await apiFetch('/api/documents/list');
                if (response.ok) {
                    const data = await response.json();
                    console.log('Fetched documents:', data);
                    setDocuments(data.documents);
                }
            } catch (error) {
                console.error('Error fetching documents:', error);
            }
        };

        if (isOpen) {
            fetchDocuments();
        }
    }, [isOpen]);

    return (
        <div className='flex flex-column' style={{
            width: isOpen ? '290px' : '0',
            height: '100vh',
            background: '#222',
            transition: 'width 0.3s ease',
            overflow: 'hidden',
            borderRight: isOpen ? '5px solid #2B2B2B' : 'none'
        }}>
        <div style={{ display: 'flex', padding: '15px', justifyContent: 'space-between', alignItems: 'center' }}>
            <img src={IconLogo} alt="Logo" height="20" />
            <img src={IconPanClose} alt="Close Drawer" height="20" style={{ cursor: 'pointer' }} onClick={onClose} />
        </div>
        
        <div className='flex flex-column hght-100' style={{ opacity, transition }}>
        <div className='flex flex-column gap-10 mrgnt-15'>
            <Link to="/sheet" style={{ textDecoration: 'none', color: 'inherit' }} className='drawer-item flex flex-row-center gap-12'>
                <img src={IconNew} alt="New Document" height="16" />
                <p className='text--micro text__medium'>New Document</p>
            </Link>
        </div>
        <div style={{ color: '#ccc' }}>
            <p className='text--micro text__semibold opacity-5 mrgnt-15' style={{ padding: "0 15px" }}>History</p>
            <ul className='mrgnt-10 text--micro document-history'>
                {documents.length > 0 ? (
                    documents.map((doc) => (
                        <Link 
                            key={doc.id} 
                            to={`/document/${doc.id}/sheet/default-sheet`} 
                            style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                            <li>{doc.name || doc.title}</li>
                        </Link>
                    ))
                ) : (
                    <li style={{ opacity: 0.5, paddingLeft: '15px' }}>No documents yet</li>
                )}
            </ul>
        </div>
        <div className='spacer'></div>
        <div className='flex flex-column gap-5 mrgnt-15 mrgnb-10'>
            <Link to="/settings" style={{ textDecoration: 'none', color: 'inherit' }} className='drawer-item flex flex-row-center gap-12'>
                <img src={IconSettings} alt="New Document" height="16" />
                <p className='text--micro text__medium'>Settings</p>
            </Link>
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}  className='drawer-item flex flex-row-center gap-12'>
                <img src={IconLogout} alt="New Document" height="16" />
                <p className='text--micro text__medium'>Logout</p>
            </Link>
        </div>
        </div>
    </div>
    );
}
