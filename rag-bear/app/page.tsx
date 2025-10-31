"use client"
import logo from "./assets/o_ursao.png"
import Image from "next/image"
import { Message, useChat } from "@ai-sdk/react"
import Bubble from "./components/Bubble"
import LoadingBubble from "./components/LoadingBubble"
import React from "react"

const Home = () => {
    const { append, messages, input, handleInputChange, handleSubmit, status } = useChat({
        api: '/api/chat',
        onError: (error) => {
            console.error("❌ Erro no chat:", error)
        }
    })
    
    const noMessages = !messages || messages.length === 0

    return (
        <main>
            <Image src={logo} width={250} alt="O Ursao Logo" />
            <section className={noMessages ? "" : "populated"}>
                {noMessages ? (
                    <>
                    <p className="starter-text">
                        Sou o Ursão, pode perguntar qualquer dúvida sobre a Oktoberlim!
                    </p>
                    <br/>
                    </>
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
                    <input type="submit" value="Enviar" disabled={status === "submitted" || status === "streaming"}/>
                </form>
        </main>
    )
}

export default Home