CREATE OR REPLACE FUNCTION record_payment_atomic(
  p_student_id        UUID,
  p_fee_assignment_id UUID,
  p_amount            NUMERIC,
  p_method            TEXT,
  p_reference         TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_id      UUID;
  v_current_due     NUMERIC;
  v_new_due         NUMERIC;
  v_outstanding_id  UUID;
BEGIN

  INSERT INTO payments (
    student_id, fee_assignment_id, amount, method, reference, status
  )
  VALUES (
    p_student_id, p_fee_assignment_id, p_amount, p_method, p_reference, 'paid'
  )
  RETURNING id INTO v_payment_id;

  SELECT id, amount_due
  INTO v_outstanding_id, v_current_due
  FROM outstanding
  WHERE student_id        = p_student_id
    AND fee_assignment_id = p_fee_assignment_id;

  IF v_outstanding_id IS NOT NULL THEN
    v_new_due := GREATEST(0, v_current_due - p_amount);
    UPDATE outstanding SET amount_due = v_new_due WHERE id = v_outstanding_id;
  END IF;

  RETURN json_build_object(
    'payment_id',  v_payment_id,
    'amount_paid', p_amount,
    'amount_due',  COALESCE(v_new_due, NULL)
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Payment transaction failed: %', SQLERRM;
END;
$$;