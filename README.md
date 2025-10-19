# Liteb (In progress...)

Liteb is a lightweight and simple backend framework. Its main goal is to facilitate the development of modern APIs with minimal configuration while following best practices. Liteb is inspired by the architecture and ease of use of frameworks like NestJS, offering modular organization, intuitive route handling, database integration through TypeORM, and support for scheduled tasks.

With Liteb, you can quickly define your API modules and controllers, associate middlewares and schema validations, and manage recurring or scheduled tasks. The framework prioritizes ease of use, low resource consumption, and a short learning curve, without sacrificing the power needed to build robust and scalable applications.

This project is designed for developers who are looking for a simple and fast alternative to launch backend services without the overhead of complex configurations, while maintaining a solid and extensible structure.

## Install

`npm install liteb`

## Progress

| Feature                     | Status |
| --------------------------- | ------ |
| Routing                     | ✔     |
| Environment Vars            | ✔     |
| API Documentation (Swagger) | ❌     |
| File Upload (Multer)        | ✔     |
| Validation (Schema)         | ✔     |
| Testing                     | ❌     |
| Scheduler / Tasks           | ✔     |
| Cookie Manager              | ✔     |
| WebSockets                  | ❌     |
| Email / Notifications       | ❌     |
| View                        | ❌     |
| Static files                | ✔     |

## VARIABLES

| Variable    | Optional | Description                             |
| ----------- | -------- | --------------------------------------- |
| PORT        | 5000     | Port server                             |
| DB_HOST     |          | Hostname: example; localhost, 127.0.0.1 |
| DB_NAME     |          | Name database                           |
| DB_PORT     | 27017    | Port database                           |
| DB_USERNAME | ''       | Username database                       |
| DB_PASSWORD | ''       | Password database                       |
| CORS_ORIGIN |          | security layers.                        |

## Example Guide

[Example](https://github.com/ertrii/liteb/tree/main/src)
