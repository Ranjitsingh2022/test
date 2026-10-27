# test
ai_gantt_enterprise/
├── app.py                    # Streamlit UI and application entry point
├── config/
│   └── settings.py           # Environment and application settings
├── core/
│   ├── gantt_service.py      # Gantt chart generation and task logic
│   ├── vertex_ai_service.py  # Google Vertex AI integration
│   └── export_service.py     # Excel, JSON and PPT exports
├── models/
│   └── task.py               # Task schemas and validation
├── utils/
│   ├── logging_config.py     # Centralized logging
│   └── helpers.py            # Common utilities
├── tests/
│   ├── test_gantt.py
│   └── test_vertex_ai.py
├── .env.example
├── .gitignore
├── requirements.txt
├── Dockerfile
├── README.md
└── pyproject.toml
