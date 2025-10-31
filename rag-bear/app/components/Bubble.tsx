'use client'

import ReactMarkdown from 'react-markdown'

const Bubble = ({ message }: { message: { content: string, role: string } }) => {
    const { content, role } = message;
    
    return (
        <div className={`bubble ${role}`}>
            {role === 'user' ? (
                // Usuário: apenas texto simples
                content
            ) : (
                // IA: renderizar com Markdown
                <ReactMarkdown
                    components={{
                        p: ({node, ...props}) => <p style={{ marginBottom: '0.5rem' }} {...props} />,
                        strong: ({node, ...props}) => <strong style={{ fontWeight: 'bold' }} {...props} />,
                        em: ({node, ...props}) => <em style={{ fontStyle: 'italic' }} {...props} />,
                        ul: ({node, ...props}) => <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }} {...props} />,
                        ol: ({node, ...props}) => <ol style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }} {...props} />,
                        li: ({node, ...props}) => <li style={{ marginBottom: '0.25rem' }} {...props} />,
                        code: ({node, inline, ...props}: any) => 
                            inline ? (
                                <code style={{ backgroundColor: '#f0f0f0', padding: '0.2rem 0.4rem', borderRadius: '3px', fontFamily: 'monospace' }} {...props} />
                            ) : (
                                <code {...props} />
                            ),
                        pre: ({node, ...props}) => <pre style={{ backgroundColor: '#f5f5f5', padding: '1rem', borderRadius: '5px', overflow: 'auto', marginBottom: '0.5rem' }} {...props} />,
                        h1: ({node, ...props}) => <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '0.5rem' }} {...props} />,
                        h2: ({node, ...props}) => <h4 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '0.5rem' }} {...props} />,
                        h3: ({node, ...props}) => <h5 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '0.5rem' }} {...props} />,
                        a: ({node, ...props}) => <a style={{ color: '#0066cc', textDecoration: 'underline' }} {...props} />,
                        blockquote: ({node, ...props}) => <blockquote style={{ borderLeft: '3px solid #ddd', paddingLeft: '1rem', marginLeft: '0', color: '#666' }} {...props} />,
                    }}
                >
                    {content}
                </ReactMarkdown>
            )}
        </div>
    )
}

export default Bubble;