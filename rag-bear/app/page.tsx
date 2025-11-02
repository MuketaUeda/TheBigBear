"use client"
import logo from "./assets/o_ursao.png"
import Image from "next/image"
import { Message, useChat } from "@ai-sdk/react"
import Bubble from "./components/Bubble"
import LoadingBubble from "./components/LoadingBubble"
import React from "react"

const Home = () => {
    const { append, messages, input, handleInputChange, handleSubmit, status, setMessages } = useChat({
        api: '/api/chat',
        onError: (error) => {
            console.error("❌ Erro no chat:", error)
        }
    })
    
    const noMessages = !messages || messages.length === 0

    const resetChat = () => {
        setMessages([])
    }

    return (
        <>
            <aside className="sidebar">
                <Image src={logo} width={150} alt="O Ursao Logo" />
                <button 
                    onClick={resetChat}
                    className="reset-button"
                    title="Reiniciar chat"
                >
                    <i className="fas fa-repeat"></i>
                    <span>Limpar chat</span>
                </button>
                <p className="sidebar-text">
                            Sou o Ursão, pode perguntar qualquer dúvida sobre a Oktoberlim!
                            <br />
                            Você pode perguntar sobre a Oktoberlim, Fornecedores, Áreas, Contratos e tudo mais que estiver relacionado a festa.
                </p>
            </aside>
            
            <main>
                <section className={noMessages ? "" : "populated"}>
                    {noMessages ? (
                        <p className="starter-text">
                            Olá como posso ajudar?
                        </p>
                    ) : (
                        <>
                            {messages.map((message, index) => (
                                <Bubble key={message.id || `message-${index}`} message={message}/>
                            ))}
                            {status === "submitted" || status === "streaming" ? (
                                <LoadingBubble/>
                            ) : null}
                        </>
                    )}
                </section>
                <form onSubmit={handleSubmit}>
                    <input className="question-box" onChange={handleInputChange} value={input} placeholder="Pergunte algo..."/>
                    <button type="submit" disabled={status === "submitted" || status === "streaming"}>
                        <i className="fas fa-paper-plane"></i>
                    </button>
                </form>
            </main>
        </>
    )
}

export default Home