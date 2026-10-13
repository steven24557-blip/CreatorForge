"""Ownership and authorization helpers for CreatorForge resources."""
from fastapi import HTTPException


async def require_owner(db, collection: str, doc_id: str, user: dict, id_field: str = "id"):
    """Fetch a document and raise 404/403 if it does not exist or does not belong to the user.

    Usage in a route:
        doc = await require_owner(db, "projects", project_id, user)
    """
    doc = await db[collection].find_one({id_field: doc_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        exists = await db[collection].find_one({id_field: doc_id}, {"_id": 0, "user_id": 1})
        if not exists:
            raise HTTPException(status_code=404, detail=f"{collection[:-1].title() if collection.endswith('s') else collection} not found")
        raise HTTPException(status_code=403, detail="Not authorized to access this resource")
    return doc
