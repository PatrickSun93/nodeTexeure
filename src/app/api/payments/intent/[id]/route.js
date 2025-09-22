import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    
    // Forward the request to the backend
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Forward authorization header if present
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      headers.authorization = authHeader;
    }
    
    const backendResponse = await fetch(`${process.env.BACKEND_URL}/api/payments/intent/${id}`, {
      method: 'GET',
      headers
    });

    const data = await backendResponse.json();
    
    return NextResponse.json(data, { 
      status: backendResponse.status 
    });
  } catch (error) {
    console.error('Error retrieving payment intent:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        message: 'Failed to retrieve payment intent',
        error: error.message 
      },
      { status: 500 }
    );
  }
}