# Aura Skincare AI Voice Agent

An AI-powered customer support application for Aura Skincare. It provides a React-based interface for order support and skincare-related questions, with a FastAPI backend that uses Groq for AI responses.

## Features

- Customer support through a text interface and browser-supported voice interaction.
- Order listing and order lookup.
- Skincare customer support and policy-related questions.
- Support for damaged-product photo submissions.
- Call-log and damage-report API endpoints.
- Transcript and summary data structures for support interactions.

> Voice features depend on browser support and permissions. The frontend currently expects the backend at `http://127.0.0.1:8000`.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Python, FastAPI, Uvicorn |
| AI provider | Groq API |
| Configuration | Environment variables with `python-dotenv` |
| Voice interface | Browser-supported voice capabilities |

## Architecture

1. The customer interacts with the React frontend using the available text or voice interface.
2. The frontend sends supported requests to the FastAPI backend.
3. The backend handles the relevant support or order operation and uses the configured Groq model for AI responses where required.
4. The frontend displays the response to the customer.

The frontend and backend run as separate local development services. The backend API can be inspected through FastAPI's automatically generated documentation.

## Project Structure

```text
AI INTERN/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── .env.example
│   └── .gitignore
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
├── .gitignore
└── README.md
