import IconTick from '../../assets/checkmark.svg';
import IconDismiss from '../../assets/dismiss.svg';
import Loader from '../../assets/loader-mini.gif';

const formatArgs = (args) => {
    if (typeof args === 'object' && args !== null) {
        return JSON.stringify(args, null, 2);
    }
    return args;
};

const AssistantToolStep = ({ msg, index }) => {
    if (msg.type === 'working') {
        return (
            <div key={index} className="message message-tool text--micro">
                <div className='flex flex-row-center' style={{padding: '6px 0', }}>
                    <img src={Loader} alt="Loading" height="12" style={{marginRight: '6px', opacity: 0.5}} />
                    <p className='text--micro'>Working...</p>
                </div>
            </div>
        );
    }

    const toolDisplayName = msg.toolName.replace('tool_', '').replace(/_/g, ' ');
    const args = formatArgs(msg.arguments);

    let statusIcon = Loader;
    let iconOpacity = 0.5;

    if (msg.status === 'completed') {
        statusIcon = IconTick;
        iconOpacity = 1;
    } else if (msg.status === 'failed' || msg.status === 'error') {
        statusIcon = IconDismiss;
        iconOpacity = 1;
    }

    return (
        <div key={index} className="message message-tool text--micro">
            <p style={{padding: '6px 0', }}>
                <img src={statusIcon} alt="Status Icon" height="12" style={{marginRight: '6px', opacity: iconOpacity}} />
                <strong>{toolDisplayName}</strong>
                {msg.status === 'pending' && <span style={{marginLeft: '6px', opacity: 0.5}}>...</span>}
            </p>
        </div>
    );
};

export { formatArgs };
export default AssistantToolStep;
