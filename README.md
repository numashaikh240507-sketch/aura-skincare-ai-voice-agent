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

## Tell Us How You Think

### 1. Why did you choose your particular architecture and technology stack?

I chose React with Vite for the frontend because it supports a responsive, component-based user interface and fast development. I used Python with FastAPI for the backend because it provides a lightweight way to build APIs and connect the application to AI services. Groq powers the AI responses, while REST endpoints allow the frontend and backend to communicate. Separating the frontend and backend makes the application easier to maintain, test, and extend.

### 2. What was the most difficult part of the assignment, and how did you solve it?

One of the main challenges was connecting the AI functionality with the customer support interface while keeping the interaction responsive. I separated the frontend and backend responsibilities, used API endpoints to handle requests, and tested the backend health endpoint to verify that the service was running. I also focused on understanding response delays and identifying opportunities to reduce unnecessary waiting during text and voice interactions.

### 3. If you had one more week to work on this, what would you improve first and why?

I would first improve response speed and reliability, especially for voice conversations, because customers expect quick and natural support. I would then strengthen error handling, test the complete order lookup and support workflows, and improve the interface feedback while the AI is processing a request. Finally, I would add automated tests to catch regressions before deployment.

### 4. Imagine this agent is handling 1,000 customer conversations a day. What do you think would need to change or improve?

I would make the backend more scalable by deploying it on reliable hosting, using asynchronous request handling where appropriate, and adding rate limits, timeouts, and retry strategies. I would monitor latency, errors, and AI usage, and use queues for tasks that do not need an immediate response. I would also add secure authentication, protect customer data, and use a database designed for reliable concurrent access. Finally, I would load-test the application and monitor AI provider limits and costs before increasing traffic.

