import { convertMarkdownToHtml } from '../../utils/utils.js';

/**
 * Renders a single chat message (user, assistant, or error) in the assistant panel.
 *
 * @param {Object} props
 * @param {Object} props.msg - Message object
 * @param {'user'|'assistant'|'error'} props.msg.type - Message type
 * @param {string} props.msg.content - Message text (markdown for assistant messages)
 * @param {number} props.index - Message index in the conversation list
 */
const AssistantMessage = ({ msg, index }) => {
    return (
        <div
            key={index}
            className={`message message-${msg.type} text--micro`}
        >
            {msg.type === 'assistant' ? (
                <p dangerouslySetInnerHTML={{ __html: convertMarkdownToHtml(msg.content) }} />
            ) : msg.type === 'error' ? (
                <p style={{color: 'var(--error-color)'}}>{msg.content}</p>
            ) : (
                <p>{msg.content}</p>
            )}
        </div>
    );
};

export default AssistantMessage;
