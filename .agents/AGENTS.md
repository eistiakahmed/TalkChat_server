# Project Rules & Guidelines for AI Agents

## 1. Git Workflow & Branching Strategy

### 1.1 Core Branches

- `main`: Production-ready branch.
- `development`: Active integration and development base branch. All feature branches originate from and merge back into `development`.

### 1.2 Starting Any New Task / Feature

Before writing any code or starting a new phase/task, **ALWAYS**:

1. Check out the `development` branch:

   ```bash
   git checkout development

   ```

2. Pull the latest updates:

   ```bash
   git pull origin development
   ```

3. Create a dedicated feature or chore branch from the updated `development`:

   ```bash
   git checkout -b feature/<feature-name>
   # or chore/<chore-name>, fix/<fix-name>
   ```

### 1.3 Completing a Task / Feature

1. Ensure all code compiles and verification tests pass.

2. Commit changes with clean, semantic commit messages (e.g., `feat(auth): implement refresh token rotation`).
3. Push the feature branch to remote:

   ```bash
   git push -u origin <branch-name>
   ```

4. Create a Pull Request (PR) into the `development` branch.

5. Never commit directly to `main` or merge directly into `development` without verification.

---

## 2. Development & Implementation Rules

1. **Step-by-Step Execution**:
   - Work strictly phase by phase according to the agreed roadmap.
   - Never write code for a phase without user confirmation on the plan.
2. **Architecture**:
   - Follow the **Modular Monolith** structure in `backend/src/modules/`.
   - Keep controllers thin, business logic in services, and database queries in repositories or services using Prisma.
3. **Type Safety & Validation**:
   - Use TypeScript with strict typing.
   - Validate all incoming request payloads with Zod schemas before hitting controllers.
4. **Error Handling**:
   - Use centralized error handling with custom `AppError` classes.
   - Avoid unhandled promise rejections or silent try/catch blocks.
5. **Real-time & Background Jobs**:
   - Use Redis adapter for Socket.io to allow horizontal scaling.
   - Offload heavy tasks (notifications, media processing, analytics) to BullMQ workers.
