import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import IconPanClose from '../assets/pan-close.svg';
import IconLogo from '../assets/logo-icon.svg';
import IconNew from '../assets/add.svg';
import IconSettings from '../assets/settings.svg';
import IconLogout from '../assets/sign-out.svg';

export default function Drawer({ isOpen, onClose }) {
    const [opacity, setOpacity] = useState(isOpen ? 1 : 0);
    const [transition, setTransition] = useState(isOpen ? 'opacity 0.2s ease' : 'none');

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => setOpacity(1), 200);
            setTransition('opacity 0.2s ease');
        } else {
            setOpacity(0);
            setTransition('none');
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
                <Link to="/sheet" style={{ textDecoration: 'none', color: 'inherit' }}><li>Lorem ipsum dolor sit</li></Link>
                <Link to="/sheet" style={{ textDecoration: 'none', color: 'inherit' }}><li>Amet consectetur adipiscing elit</li></Link>
                <Link to="/sheet" style={{ textDecoration: 'none', color: 'inherit' }}><li>Sed do eiusmod tempor consectetur</li></Link>
                <Link to="/sheet" style={{ textDecoration: 'none', color: 'inherit' }}><li>Incididunt ut labore et ipsum</li></Link>
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
