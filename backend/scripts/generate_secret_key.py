"""
Generate a secure SECRET_KEY for JWT authentication
"""
import secrets

def generate_secret_key():
    """Generate a secure random secret key"""
    return secrets.token_urlsafe(32)

if __name__ == "__main__":
    key = generate_secret_key()
    print("=" * 60)
    print("Generated SECRET_KEY for JWT Authentication")
    print("=" * 60)
    print(f"\n{key}\n")
    print("=" * 60)
    print("\nAdd this to your .env file or environment variables:")
    print(f"SECRET_KEY={key}")
    print("=" * 60)
