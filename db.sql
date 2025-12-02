-- estateLink Database Schema
-- PostgreSQL Database Tables

-- Drop existing tables if they exist (for fresh start)
DROP TABLE IF EXISTS "Users" CASCADE;

-- Create Users table
CREATE TABLE "Users" (
    "id" SERIAL PRIMARY KEY,
    "username" VARCHAR(50) UNIQUE NOT NULL,
    "fullName" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100) UNIQUE NOT NULL,
    "phoneNumber" VARCHAR(9) NOT NULL,
    "accountType" VARCHAR(20) NOT NULL DEFAULT 'tenant' CHECK (accountType IN ('tenant', 'landlord', 'technician', 'admin')),
    "password" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN DEFAULT true,
    "lastLogin" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX "idx_users_username" ON "Users"("username");
CREATE INDEX "idx_users_email" ON "Users"("email");
CREATE INDEX "idx_users_accountType" ON "Users"("accountType");
CREATE INDEX "idx_users_isActive" ON "Users"("isActive");

-- Insert default admin user (password will be hashed in application)
INSERT INTO "Users" ("username", "fullName", "email", "phoneNumber", "accountType", "password")
VALUES ('default_admin', 'System Administrator', 'admin@estatelink.com', '123456789', 'admin', 'default_password');

-- Create trigger to update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON "Users" 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Sample data for testing (optional)
-- INSERT INTO "Users" ("username", "fullName", "email", "phoneNumber", "accountType", "password")
-- VALUES 
--     ('john_doe', 'John Doe', 'john@example.com', '675644383', 'tenant', 'password123'),
--     ('jane_smith', 'Jane Smith', 'jane@example.com', '812345678', 'landlord', 'password123'),
--     ('mike_wilson', 'Mike Wilson', 'mike@example.com', '923456789', 'technician', 'password123');

-- Comments
COMMENT ON TABLE "Users" IS 'User accounts for estateLink application';
COMMENT ON COLUMN "Users"."accountType" IS 'User role: tenant, landlord, technician, or admin';
COMMENT ON COLUMN "Users"."phoneNumber" IS '9-digit phone number format';
COMMENT ON COLUMN "Users"."isActive" IS 'Whether the user account is active';
