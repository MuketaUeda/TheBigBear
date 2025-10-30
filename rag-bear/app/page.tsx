"use client"
import logo from "./assets/o_ursao.png"
import Image from "next/image"
import { useChat, Message } from "@ai-sdk/react"

const Home = () => {
    return (
        <main>
            <Image src={logo} width={250} alt="O Ursao Logo" />
        </main>
    )
}

export default Home