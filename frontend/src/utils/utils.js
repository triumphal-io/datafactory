import Showdown from 'showdown';
import { toast } from 'react-toastify';

/** @constant {string} Default LiteLLM model identifier used when no model is explicitly selected */
export const DEFAULT_AI_MODEL = 'gemini/gemini-2.5-flash';

/**
 * Convert a date to a relative time string (e.g., "2 hours ago", "just now")
 * @param {Date} date - The date to convert
 * @returns {string} Relative time string
 */
export const getTimeAgo = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    
    const years = Math.floor(months / 12);
    return `${years} ${years === 1 ? 'year' : 'years'} ago`;
};

/**
 * Convert Markdown text to HTML using Showdown
 * @param {string} text - The markdown text to convert
 * @returns {string} HTML string
 */
export const convertMarkdownToHtml = (text) => {
    Showdown.setFlavor('github');
    Showdown.extension('targetlink', function () {
        return [{
            type: 'html',
            regex: /(<a [^>]+?)(>.*<\/a>)/g,
            replace: '$1 target="_blank"$2'
        }];
    });
    const converter = new Showdown.Converter({
        extensions: ['targetlink']
    });
    return converter.makeHtml(text);
};

/**
 * Show a toast notification using react-toastify
 * @param {string} message - The message to display
 * @param {string} type - The type of toast ('success', 'error', 'info', 'warning')
 * @param {number} duration - Duration in milliseconds (default: 3000)
 * @param {string|number} toastId - Optional toast ID to update an existing toast
 * @returns {string|number} The toast ID
 */
export const showToast = (message, type = 'info', duration = 3000, toastId = null) => {
    const options = {
        autoClose: duration,
    };

    // If toastId is provided, update the existing toast
    if (toastId) {
        toast.update(toastId, {
            render: message,
            type: type,
            autoClose: duration,
            isLoading: false,
        });
        return toastId;
    }

    // Otherwise create a new toast and return its ID
    switch (type) {
        case 'success':
            return toast.success(message, options);
        case 'error':
            return toast.error(message, options);
        case 'warning':
            return toast.warning(message, options);
        case 'info':
        default:
            return toast.info(message, options);
    }
};

