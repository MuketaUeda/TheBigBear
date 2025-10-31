const Bubble = ({ message }: { message: { content: string, role: string } }) => {
    const { content, role } = message;
    return (
        <div className={`bubble ${role}`}>{content}</div>
    )
}

export default Bubble;