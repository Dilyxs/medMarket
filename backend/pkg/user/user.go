package user

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// User represents a user in the system
type User struct {
	ID                  string    `bson:"_id"`
	Email               string    `bson:"email"`
	Name                string    `bson:"name"`
	Balance             float64   `bson:"balance"`
	AssistantUnlockedAt time.Time `bson:"assistant_unlocked_at,omitempty"`
	AssistantPurchases  int       `bson:"assistant_purchases"`
	CreatedAt           time.Time `bson:"created_at"`
	UpdatedAt           time.Time `bson:"updated_at"`
}

// InitializeUserBalance ensures user has a balance field
func InitializeUserBalance(ctx context.Context, collection *mongo.Collection, userID string) error {
	_, err := collection.UpdateOne(ctx, bson.M{"_id": userID}, bson.M{
		"$setOnInsert": bson.M{
			"balance": 0.0,
		},
	}, &mongo.UpdateOptions{})
	return err
}

// GetBalance retrieves a user's balance
func GetBalance(ctx context.Context, collection *mongo.Collection, userID string) (float64, error) {
	var user bson.M
	err := collection.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	if err != nil {
		return 0, err
	}

	balance := 0.0
	if b, exists := user["balance"]; exists {
		balance, _ = b.(float64)
	}
	return balance, nil
}

// AddBalance adds to a user's balance
func AddBalance(ctx context.Context, collection *mongo.Collection, userID string, amount float64) error {
	_, err := collection.UpdateOne(ctx, bson.M{"_id": userID}, bson.M{
		"$inc": bson.M{"balance": amount},
		"$set": bson.M{"updated_at": time.Now()},
	})
	return err
}

// SubtractBalance subtracts from a user's balance
func SubtractBalance(ctx context.Context, collection *mongo.Collection, userID string, amount float64) error {
	return AddBalance(ctx, collection, userID, -amount)
}
