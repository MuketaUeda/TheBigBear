import "./global.css"
import { ReactNode } from "react"

export const metadata = {
    title: "O Ursao",
    description: "O Ursao é um chatbot de IA que responde perguntas sobre a Oktoberlim",
}

const RootLayout = ({ children }: { children: ReactNode }) => {
    return (
        <html lang="pt-BR">
            <body>
                {children}
            </body>
        </html>
    )
}

export default RootLayout