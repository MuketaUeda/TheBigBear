# 🐻 Ursão - The Big Bear

> Um assistente de IA inteligente alimentado por RAG (Retrieval-Augmented Generation) que responde perguntas sobre a Oktoberlim com precisão e personalidade.

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.0.0-black.svg)
![React](https://img.shields.io/badge/React-19.2.0-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)

---

## 🎯 Visão Geral

**Ursão** é um chatbot de IA conversacional que fornece informações precisas e contextualizadas sobre a Oktoberlim. Utilizando a tecnologia de **Retrieval-Augmented Generation (RAG)**, o assistente busca a informação mais relevante em seu banco de dados antes de gerar uma resposta, garantindo acurácia e confiabilidade.

### ✨ Principais Características

- 🤖 **IA Inteligente**: Powered by Google Gemini 2.5 Flash
- 🔍 **Busca Semântica**: Utiliza vetores para encontrar contexto relevante
- 💾 **Base de Dados Vetorizada**: AstraDB para armazenamento otimizado
- ⚡ **Streaming em Tempo Real**: Respostas aparecem progressivamente
- 🎨 **Interface Moderna**: UI intuitiva e responsiva
- 📱 **Totalmente Mobile**: Funciona perfeitamente em qualquer dispositivo
- 🔄 **Histórico de Conversa**: Mantém contexto entre mensagens

---

## 🚀 Quick Start

### Pré-requisitos

- Node.js 18+
- npm ou yarn
- Conta AstraDB com token ativo
- API Key do Google Gemini

### 1️⃣ Instalação

```bash
# Clone o repositório
git clone <seu-repo>
cd rag-bear

# Instale as dependências
npm install
```

### 2️⃣ Configurar Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz do projeto:

```env
# Configurações AstraDB
ASTRA_DB_TOKEN=seu_token_aqui
ASTRA_DB_API_ENDPOINT=https://sua-api-endpoint.astradb.com
ASTRA_DB_NAMESPACE=seu_namespace
ASTRA_DB_COLLECTION=sua_collection

# API Key Google Gemini
GOOGLE_API_KEY=sua_chave_google_aqui
```

### 3️⃣ Carregar Dados no Banco

```bash
# Seed the database com documentos
npm run seed
```

### 4️⃣ Iniciar o Servidor

```bash
# Modo desenvolvimento
npm run dev

# Modo produção
npm run build
npm start
```

Acesse `http://localhost:3000` no seu navegador! 🎉

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (Next.js)                │
│  ┌─────────────────────────────────────────────┐    │
│  │  • React Components (Bubble, LoadingBubble) │    │
│  │  • UI Responsiva & Streaming em Tempo Real  │    │
│  └─────────────────────────────────────────────┘    │
└────────────────┬────────────────────────────────────┘
                 │ HTTP Streaming
┌────────────────▼─────────────────────────────────┐
│           API Route (Chat Endpoint)              │
│  ┌─────────────────────────────────────────────┐ │
│  │ 1. Processa mensagem do usuário             │ │
│  │ 2. Busca contexto no AstraDB (Vetores)      │ │
│  │ 3. Enriquece prompt com contexto            │ │
│  │ 4. Envia para Google Gemini                 │ │
│  │ 5. Retorna stream de resposta               │ │
│  └─────────────────────────────────────────────┘ │
└────────────────┬─────────────────────────────────┘
                 │
         ┌───────┴────────────┐
         │                    │
    ┌────▼──── ┐        ┌─────▼──────┐
    │ AstraDB  │        │   Google   │
    │(Vetores) │        │   Gemini   │
    │(Contexto)│        │    LLM     │
    └──────────┘        └────────────┘
```

---

## 📁 Estrutura do Projeto

```
rag-bear/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # Endpoint da API (RAG Logic)
│   ├── components/
│   │   ├── Bubble.tsx            # Componente de mensagem
│   │   └── LoadingBubble.tsx      # Indicador de carregamento
│   ├── assets/
│   │   └── o_ursao.png           # Logo do mascote
│   ├── global.css                 # Estilos globais
│   ├── layout.tsx                 # Layout da aplicação
│   └── page.tsx                   # Página principal (Chat)
├── scripts/
│   └── loadDb.ts                  # Script para carregar dados
├── documents/
│   └── CV_Gabriel_Rosati_IA.pdf   # Documentação de referência
├── package.json                   # Dependências do projeto
├── tsconfig.json                  # Configuração TypeScript
├── next.config.ts                 # Configuração Next.js
└── README.md                      # Este arquivo
```

---

## 🔧 Stack Tecnológico

### Frontend
- **Next.js 16** - Framework React com SSR
- **React 19** - Biblioteca UI
- **React Markdown** - Renderização de markdown nas respostas
- **CSS3** - Estilos responsivos

### Backend & IA
- **LangChain** - Orquestração de IA
- **Google Gemini 2.5 Flash** - LLM base
- **LangChain Google GenAI** - Integração com Gemini
- **AstraDB** - Base de dados vetorizada

### Ferramentas
- **TypeScript** - Type safety
- **ESLint** - Code quality
- **TSX** - Execução de scripts TypeScript

---

## 💡 Como Funciona (RAG)

### Fluxo de Pergunta-Resposta

1. **Entrada do Usuário** 📝
   - Usuário digita uma pergunta no chat

2. **Busca Vetorizada** 🔍
   - Query é convertida em vetor
   - Busca no AstraDB por documentos similares
   - Retorna os 3 documentos mais relevantes

3. **Enriched Prompt** 📚
   - Contexto dos documentos é adicionado ao prompt
   - System prompt instrui a IA a usar essas informações
   - Mantém histórico da conversa para coerência

4. **Geração de Resposta** 🤖
   - Google Gemini processa a requisição
   - Resposta é gerada em streaming
   - Cada "chunk" é enviado em tempo real para o frontend

5. **Renderização** ✨
   - Frontend recebe chunks progressivamente
   - Mensagem aparece letra por letra
   - Usuário vê resposta sendo "digitada"

---

## 🎨 Personalização

### Customizar Mascote
Substitua `/app/assets/o_ursao.png` com sua imagem

### Mudar Mensagem de Boas-vindas
Edite em `/app/page.tsx`:
```tsx
<p className="starter-text">
  Sou o Ursão, pode perguntar qualquer dúvida sobre a Oktoberlim!
</p>
```

### Ajustar Prompt do Sistema
Modifique em `/app/api/chat/route.ts`:
```typescript
const systemPrompt = `Você é um assistente especializado em...`
```

### Sintonizar Temperatura da IA
```typescript
temperature: 0.5 // Aumentar para mais criatividade, diminuir para mais precisão
```

---

## 📦 Scripts Disponíveis

```bash
# Desenvolvimento
npm run dev          # Inicia servidor em modo dev (http://localhost:3000)

# Produção
npm run build        # Compila para produção
npm start            # Inicia servidor em modo produção

# Dados
npm run seed         # Carrega documentos no banco de dados

# Qualidade
npm run lint         # Executa eslint para verificar código
```

---

## 🔐 Variáveis de Ambiente

| Variável | Descrição | Obrigatória |
|----------|-----------|-------------|
| `ASTRA_DB_TOKEN` | Token de autenticação do AstraDB | ✅ |
| `ASTRA_DB_API_ENDPOINT` | URL da API do AstraDB | ✅ |
| `ASTRA_DB_NAMESPACE` | Namespace do banco | ✅ |
| `ASTRA_DB_COLLECTION` | Nome da collection | ✅ |
| `GOOGLE_API_KEY` | Chave da API do Google Gemini | ✅ |

---

## 🐛 Troubleshooting

### Problema: Respostas vazias ou incorretas
**Solução**: Verifique se o seed foi executado corretamente
```bash
npm run seed
```

### Problema: Erro de autenticação AstraDB
**Solução**: Confirme que as variáveis de ambiente estão corretas no `.env.local`

### Problema: Tempo limite na API
**Solução**: Ajuste o timeout no `route.ts` ou verifique a conexão de rede

### Problema: Streaming não funciona
**Solução**: Verifique se o navegador suporta ReadableStream (todos os navegadores modernos suportam)

---

## 📚 Documentação Adicional

- [Next.js Documentation](https://nextjs.org/docs)
- [LangChain Docs](https://js.langchain.com/)
- [Google Gemini API](https://ai.google.dev/)
- [AstraDB Docs](https://docs.datastax.com/en/astra/)

---

## 🚀 Deploy

### Deploy no Vercel (Recomendado)

```bash
# Instale Vercel CLI
npm i -g vercel

# Deploy
vercel

# Configure variáveis de ambiente no painel
# Vercel > Settings > Environment Variables
```

### Deploy no Railway/Render
1. Conecte seu repositório
2. Configure as variáveis de ambiente
3. Deploy automático

---

## 👨‍💻 Autor

Desenvolvido com ❤️ por **Gabriel Rosati**

- 🔗 [LinkedIn](https://linkedin.com/in/gabrielrosati)
- 💻 [GitHub](https://github.com/MuketaUeda)

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## 🤝 Contribuindo

Contribuições são bem-vindas! 🎉

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

---

## ⭐ Se você gostou, não esqueça de dar uma estrela!

---

**Desenvolvido com Next.js, React e IA Generativa** 🚀✨