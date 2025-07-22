
1. Communication language:  
   All work, documentation, and code comments must be conducted exclusively in English.

2. System environment:  
   We work on Mac OS in Trae – every script and tool must be fully compatible with it.

3. Analysis and iteration of existing code:  
   Before adding a new feature or fix, search the code for similar fragments and try to extend or modify them.  
   Do not drastically rebuild patterns (e.g., architecture or folder structure) without prior approval.

4. Simplicity and readability:  
   - Prefer simple, small functions that do one thing.  
   - Avoid duplication (DRY principle) – always check if similar logic already exists.

5. Runtime context:  
   - Production code must be stable and free of data simulation.  
   - Data simulation is only allowed in the test environment.  
   - Never overwrite the `.env` file without explicit consent.

6. Scope of changes:  
   Make exactly the changes that were clearly specified or discussed and approved.  
   Do not interfere with code parts unrelated to the current task.

7. New technologies and patterns:  
   When fixing bugs, rely on existing implementations.  
   Before suggesting a new library, framework, or design pattern – consult the user.

8. Repository cleanliness:  
   Each commit should contain a message clearly describing the introduced changes.  
   Remove unused files and dependencies.

9. Testing:  
   - For each significant change or new feature, write and run unit/integration tests (TDD).  
   - Ensure all tests pass before merging code into the main branch.

10. Impact analysis:  
    Before finalizing fixes, analyze which modules and methods may be affected and include them in tests.

11. Documentation and comments:  
    - Each function and class must contain a docstring or comment explaining its purpose, parameters, and return value.  
    - Update the project documentation with each API or core logic change.

12. Self-verification:  
    - Before marking a task as completed, conduct full verification: manual and automated tests, security review.  
    - Do not declare correctness if it hasn’t been thoroughly verified.

13. Security and stability:  
    - Validate all input data and handle exceptions.  
    - Check for vulnerabilities (e.g., SQL injection, XSS).  
    - Do not leave placeholders like `// TODO` or `return null` without further action.  
    - Use only current, supported libraries and proven algorithms/methods.  
    - Regularly check dependencies for known vulnerabilities.

14. Rephrasing and confirming requirements:  
    Before starting to code, summarize in your own words what you intend to achieve and ask for confirmation.

15. Input/output examples:  
    For key functions, provide several examples of input data and expected results.

16. Ask about priorities and acceptance criteria:  
    Ask what is more important: speed, package size, flexibility, or simplicity of implementation.

17. Step-by-step breakdown and confirmation:  
    If the task is extensive, divide it into steps. After each step, ask for confirmation.

18. Simple descriptions, no jargon:  
    Use understandable language in communication, without unnecessary technical jargon.

19. Suggest next steps:  
    After introducing a fix, suggest what can be done next (e.g., integration, additional testing, monitoring).

20. If you can’t fix it – propose an alternative:  
    If the root cause can’t be removed, propose a compromise solution.

21. Fix it until it’s gone:  
    Work on the bug until it’s really gone – don’t abandon the issue.

22. Preserve functionality:  
    During refactoring and fixes, do not remove existing functions.

23. Deep project analysis:  
    Always analyze the entire project and all its elements – from algorithms and functions to graphics and interface. Everything must fit together.

24. In-depth understanding of the problem:  
    Strive to understand the task by thoroughly analyzing code, algorithms, UI design, and user descriptions.

25. Thorough root cause search:  
    If the issue persists and the user is frustrated – perform deep analysis: check different files, functions, and algorithms until the root is found and removed. Remember, the bug may occur in multiple places.

26. Ask follow-up questions if in doubt:  
    If the problem persists or you don’t understand the user’s description – ask clarifying questions.

27. Translation support:  
    If the user’s message is hard to understand – ask for clarification or translate the message to English for analysis, but always reply in Polish.

28. Visual and UX/UI quality:  
    For design or interface tasks, use the latest patterns and inspirations (modern projects, games, apps). Ensure aesthetics, consistency, and user immersion.

29. Version control and review:  
    Each PR must undergo code review and automated tests. Do not merge code without at least one approved review and a green CI status.

30. Verifying reported issues:  
    In the end, ensure that all issues reported by the user have been resolved.

31. Think and respond when asked:  
    If the user asks something – think it through and answer.

32. Analyze the codebase carefully, make sure that the flow is flowing and the logic is logicing.

33. always remember the fornt end port is 3000 and backend is 6666
34. always check is the ports used or not, if used, kill the process. 
35. the whole project is using node + nextjs + mysql
36. this is a e-commerce website so security is important. 
