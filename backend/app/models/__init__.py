# Import all models so Alembic autogenerate sees the full schema.
# Order matters: base first, then tables with no foreign keys,
# then tables that reference them.

from app.models.base import Base  # noqa: F401
from app.models.auth import Permission, Role, User, role_permissions  # noqa: F401
from app.models.survey import (  # noqa: F401
    AdaptiveLogic,
    Question,
    Survey,
    SurveyTemplate,
    ValidationRule,
)
from app.models.field import Assignment, Enumerator, Household  # noqa: F401
from app.models.response import Paradata, Response, ResponseVersion  # noqa: F401
from app.models.intelligence import CodingResult, TrustScore, ValidationResult  # noqa: F401
from app.models.knowledge import (  # noqa: F401
    ClassificationCode,
    KGEntity,
    KGRelation,
    KnowledgeSource,
    ReferenceDistribution,
)
from app.models.session import TranslationSession, VoiceSession  # noqa: F401
from app.models.audit import AuditLog  # noqa: F401

__all__ = ["Base"]
