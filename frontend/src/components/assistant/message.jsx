import { convertMarkdownToHtml } from '../../utils/utils.js';

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
