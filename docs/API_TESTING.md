# Zoiko Mail API testing

Start the API with `npm run dev`, then open `http://localhost:5000/api/docs` for interactive Swagger documentation.

Use `GET /api/health` for process liveness and `GET /api/ready` for PostgreSQL readiness.

For Postman, import both JSON files from this directory and select **Zoiko Mail Local**. Run **Authentication / Login** first; its test script stores the access token, refresh token, tenant ID, and membership ID automatically.

The seeded owner login is `owner@zoiko.test` with password `Password123!` and tenant ID `00000000-0000-4000-8000-000000000001`.
